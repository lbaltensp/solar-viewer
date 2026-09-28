"use client";

/**
 * Canvas playback of a frame sequence.
 *
 * - Plays in ping-pong order over the contiguous run of loaded frames that
 *   contains the playhead. Downloads are prioritised around the playhead, so
 *   that run grows outward and playback never waits for frames far away.
 * - Decodes a short run of frames ahead of the playhead in the travel direction.
 * - Never advances onto a frame whose bitmap is not decoded yet; it holds the
 *   current frame instead, so the movie slows rather than skips while loading.
 */

import { useEffect, useRef } from "react";
import type { FrameStore } from "@/lib/frameStore";
import { pingPongStep, type Direction } from "@/lib/frames";

// Frames decoded ahead of the playhead. At 24 fps this is half a second of lead.
const DECODE_AHEAD = 12;

export interface SunPlayerProps {
  frames: readonly number[];
  store: FrameStore;
  playing: boolean;
  fps: number;
  /** Controlled playhead index. */
  index: number;
  onIndexChange: (index: number) => void;
  className?: string;
}

export function SunPlayer({ frames, store, playing, fps, index, onIndexChange, className }: SunPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indexRef = useRef(index);
  const dirRef = useRef<Direction>(1);
  const lastDrawnRef = useRef<ImageBitmap | null>(null);

  // External seeks land here.
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Size the backing store to the element's CSS box at device resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const px = Math.max(1, Math.round(Math.min(rect.width, rect.height) * dpr));
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext("2d");
        const bmp = lastDrawnRef.current;
        if (ctx && bmp) ctx.drawImage(bmp, 0, 0, px, px);
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let acc = 0;

    /**
     * The contiguous run [a, b] of loaded frames containing index `i`, or null if
     * frame `i` itself is not loaded yet. Playback bounces inside this run.
     */
    const loadedRun = (i: number): { a: number; b: number } | null => {
      if (i < 0 || i >= frames.length || !store.hasBlob(frames[i])) return null;
      let a = i;
      let b = i;
      while (a > 0 && store.hasBlob(frames[a - 1])) a--;
      while (b < frames.length - 1 && store.hasBlob(frames[b + 1])) b++;
      return { a, b };
    };

    const decodeAhead = (from: number, dir: Direction, run: { a: number; b: number }) => {
      for (let k = 0; k <= DECODE_AHEAD; k++) {
        const i = from + k * dir;
        if (i < run.a || i > run.b) break;
        void store.ensureDecoded(frames[i]);
      }
      // Also keep the frame behind us warm so a direction flip is instant.
      const behind = from - dir;
      if (behind >= run.a && behind <= run.b) void store.ensureDecoded(frames[behind]);
    };

    const draw = () => {
      const ts = frames[indexRef.current];
      if (ts === undefined) return;
      const bmp = store.peekBitmap(ts);
      if (!bmp) {
        void store.ensureDecoded(ts);
        return;
      }
      if (bmp !== lastDrawnRef.current) {
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        lastDrawnRef.current = bmp;
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(250, now - last);
      last = now;

      if (indexRef.current >= frames.length && frames.length > 0) {
        indexRef.current = frames.length - 1;
        onIndexChange(indexRef.current);
      }

      const run = loadedRun(indexRef.current);

      if (playing && run && run.b - run.a >= 1) {
        acc += dt;
        const interval = 1000 / fps;
        const length = run.b - run.a + 1;
        let steps = 0;
        while (acc >= interval && steps < 4) {
          acc -= interval;
          steps++;
          const local = pingPongStep(indexRef.current - run.a, dirRef.current, length);
          const nextIndex = run.a + local.index;
          // Hold if the next frame is not decoded yet rather than skipping it.
          if (!store.peekBitmap(frames[nextIndex])) {
            void store.ensureDecoded(frames[nextIndex]);
            acc = 0;
            break;
          }
          indexRef.current = nextIndex;
          dirRef.current = local.dir;
          onIndexChange(nextIndex);
        }
      } else {
        acc = 0;
      }

      if (run) decodeAhead(indexRef.current, dirRef.current, run);
      // Download priority follows the playhead: the current frame first, then both sides.
      const i = indexRef.current;
      store.prioritize([
        ...frames.slice(i, i + DECODE_AHEAD),
        ...frames.slice(Math.max(0, i - DECODE_AHEAD), i).reverse(),
      ]);

      draw();
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames, store, playing, fps, onIndexChange]);

  // New store (channel/size change): forget the old bitmap so we redraw.
  useEffect(() => {
    lastDrawnRef.current = null;
  }, [store]);

  return <canvas ref={canvasRef} className={className} aria-label="Sun image sequence" />;
}
