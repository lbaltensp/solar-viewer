"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_WAVELENGTH, getChannel } from "@/lib/channels";
import { formatDuration } from "@/lib/frames";
import { DEFAULT_FRAME_SIZE } from "@/lib/helioviewer";
import { useTimeline } from "@/hooks/useTimeline";
import { useFrameStore } from "@/hooks/useFrameStore";
import { SunPlayer } from "./SunPlayer";
import { ChannelPicker } from "./ChannelPicker";
import { Controls } from "./Controls";
import { Timeline } from "./Timeline";

export function Viewer() {
  const [channel, setChannel] = useState(DEFAULT_WAVELENGTH);
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [fps, setFps] = useState(24);
  const [playing, setPlaying] = useState(true);
  const [index, setIndex] = useState(0);
  const size = DEFAULT_FRAME_SIZE;
  const wasPlayingRef = useRef(true);

  const timeline = useTimeline(channel, windowMinutes);
  const { store, loadedCount } = useFrameStore(channel, size, timeline.frames);

  // The frame list can shrink under the playhead; clamp on read instead of in an effect.
  const safeIndex = Math.min(index, Math.max(0, timeline.frames.length - 1));

  const onIndexChange = useCallback((i: number) => setIndex(i), []);
  const onScrubStart = useCallback(() => {
    wasPlayingRef.current = playing;
    setPlaying(false);
  }, [playing]);
  const onScrubEnd = useCallback(() => {
    if (wasPlayingRef.current) setPlaying(true);
  }, []);

  // Space toggles play; arrows step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "SELECT", "BUTTON"].includes(e.target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === "ArrowRight") {
        setPlaying(false);
        setIndex((i) => Math.min(i + 1, timeline.frames.length - 1));
      } else if (e.code === "ArrowLeft") {
        setPlaying(false);
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timeline.frames.length]);

  const ch = getChannel(channel)!;
  const latency = timeline.latencySeconds;

  return (
    <div className="flex min-h-screen flex-col bg-black text-neutral-200">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold tracking-tight">Solar Viewer</h1>
          <span className="font-mono text-xs text-neutral-500">
            SDO/AIA {ch.wavelength} Å · {ch.description}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          {latency !== null ? (
            <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-neutral-300">
              ≈ {formatDuration(latency)} behind real time
            </span>
          ) : null}
          {timeline.error ? (
            <span className="rounded-full border border-red-900 bg-red-950/50 px-2.5 py-1 text-red-300">{timeline.error}</span>
          ) : null}
        </div>
      </header>

      <div className="relative flex flex-1 items-center justify-center px-4">
        <SunPlayer
          frames={timeline.frames}
          store={store}
          playing={playing}
          fps={fps}
          index={safeIndex}
          onIndexChange={onIndexChange}
          className="aspect-square w-full max-w-[min(90vw,calc(100vh-13rem))]"
        />
        {timeline.loading && timeline.frames.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-neutral-500">
            fetching timeline…
          </div>
        ) : null}
      </div>

      <footer className="space-y-3 px-4 pb-4 pt-2 sm:px-6">
        <Timeline
          frames={timeline.frames}
          index={safeIndex}
          loadedCount={loadedCount}
          onSeek={setIndex}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChannelPicker value={channel} onChange={setChannel} />
          <Controls
            playing={playing}
            onTogglePlay={() => setPlaying((p) => !p)}
            fps={fps}
            onFpsChange={setFps}
            windowMinutes={windowMinutes}
            onWindowChange={setWindowMinutes}
          />
        </div>
        <p className="font-mono text-[11px] text-neutral-600">
          Images courtesy of NASA/SDO and the AIA science team, via Helioviewer.org · {size} px · space: play/pause ·
          ←/→: step
        </p>
      </footer>
    </div>
  );
}
