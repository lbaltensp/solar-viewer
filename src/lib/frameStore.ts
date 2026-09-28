/**
 * Client-side frame cache.
 *
 * Two tiers:
 *  - compressed WebP blobs for every frame in the window (~60 KB each, cheap to keep)
 *  - decoded ImageBitmaps in an LRU of bounded size (4 MB each at 1024 px, expensive)
 *
 * The player decodes a short run of frames ahead of the playhead, so drawing is
 * always a synchronous `drawImage` of an already-decoded bitmap.
 */

import { frameUrl } from "./frames";
import type { FrameSize } from "./helioviewer";

/**
 * Parallel frame downloads. Measured 2026-09-23 against Helioviewer at 2048 px:
 * 6 in flight → ~7–9 s each (1.5 s/frame effective); 12 in flight → 8–15 s each
 * (1.2 s/frame). Beyond ~8 the gain is marginal and the load on a shared
 * community service doubles. Browsers also cap HTTP/1.1 at 6 connections per
 * origin (dev server); HTTP/2 in production has no such cap.
 */
export const DEFAULT_CONCURRENCY = 8;

export interface FrameStoreOptions {
  channel: number;
  size: FrameSize;
  maxDecoded: number;
  concurrency?: number;
}

export class FrameStore {
  readonly channel: number;
  readonly size: FrameSize;
  private readonly maxDecoded: number;
  private readonly concurrency: number;

  private blobs = new Map<number, Blob>();
  /** Insertion order doubles as LRU order: re-inserted on every touch. */
  private bitmaps = new Map<number, ImageBitmap>();
  private failed = new Set<number>();
  private queue: number[] = [];
  private queued = new Set<number>();
  private active = 0;
  private decoding = new Map<number, Promise<ImageBitmap | null>>();
  private disposed = false;
  private listeners = new Set<() => void>();
  private notifyScheduled = false;

  constructor(opts: FrameStoreOptions) {
    this.channel = opts.channel;
    this.size = opts.size;
    this.maxDecoded = opts.maxDecoded;
    this.concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  }

  /** Subscribe to loaded-count changes. Shaped for React's useSyncExternalStore. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Coalesce bursts of completed downloads into one notification per macrotask. */
  private notify(): void {
    if (this.notifyScheduled || this.disposed) return;
    this.notifyScheduled = true;
    setTimeout(() => {
      this.notifyScheduled = false;
      for (const l of this.listeners) l();
    }, 0);
  }

  hasBlob(ts: number): boolean {
    return this.blobs.has(ts);
  }

  hasFailed(ts: number): boolean {
    return this.failed.has(ts);
  }

  get loadedCount(): number {
    return this.blobs.size;
  }

  /** Queue a frame for download if we do not have it yet. Safe to call repeatedly. */
  request(ts: number): void {
    if (this.disposed || this.blobs.has(ts) || this.queued.has(ts) || this.failed.has(ts)) return;
    this.queue.push(ts);
    this.queued.add(ts);
    this.pump();
  }

  /** Move these frames to the front of the download queue (e.g. around the playhead). */
  prioritize(tsList: readonly number[]): void {
    const wanted = tsList.filter((ts) => this.queued.has(ts));
    if (wanted.length === 0) return;
    const wantedSet = new Set(wanted);
    this.queue = [...wanted, ...this.queue.filter((ts) => !wantedSet.has(ts))];
  }

  private pump(): void {
    while (!this.disposed && this.active < this.concurrency && this.queue.length > 0) {
      const ts = this.queue.shift()!;
      void this.fetchOne(ts);
    }
  }

  private async fetchOne(ts: number): Promise<void> {
    this.active++;
    try {
      const res = await fetch(frameUrl(this.channel, ts, this.size));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (this.disposed) return;
      this.blobs.set(ts, blob);
      this.notify();
    } catch {
      // Leave it in `failed` so we do not hammer the API; a later prune/re-request can retry.
      this.failed.add(ts);
    } finally {
      this.queued.delete(ts);
      this.active--;
      this.pump();
    }
  }

  /** Synchronous: the decoded bitmap if we have it, touching LRU order. */
  peekBitmap(ts: number): ImageBitmap | undefined {
    const bmp = this.bitmaps.get(ts);
    if (bmp) {
      this.bitmaps.delete(ts);
      this.bitmaps.set(ts, bmp);
    }
    return bmp;
  }

  /** Ensure a frame is decoded soon. Resolves to null if the blob is not loaded yet. */
  ensureDecoded(ts: number): Promise<ImageBitmap | null> {
    const existing = this.peekBitmap(ts);
    if (existing) return Promise.resolve(existing);
    const inflight = this.decoding.get(ts);
    if (inflight) return inflight;
    const blob = this.blobs.get(ts);
    if (!blob) return Promise.resolve(null);

    const p = createImageBitmap(blob)
      .then((bmp) => {
        if (this.disposed) {
          bmp.close();
          return null;
        }
        this.bitmaps.set(ts, bmp);
        this.evict();
        return bmp;
      })
      .catch(() => null)
      .finally(() => this.decoding.delete(ts));
    this.decoding.set(ts, p);
    return p;
  }

  private evict(): void {
    while (this.bitmaps.size > this.maxDecoded) {
      const oldest = this.bitmaps.keys().next().value as number;
      this.bitmaps.get(oldest)?.close();
      this.bitmaps.delete(oldest);
    }
  }

  /** Drop everything not in `keep` (frames that fell out of the window). */
  prune(keep: ReadonlySet<number>): void {
    for (const ts of this.blobs.keys()) if (!keep.has(ts)) this.blobs.delete(ts);
    for (const [ts, bmp] of this.bitmaps) {
      if (!keep.has(ts)) {
        bmp.close();
        this.bitmaps.delete(ts);
      }
    }
    for (const ts of this.failed) if (!keep.has(ts)) this.failed.delete(ts);
    this.queue = this.queue.filter((ts) => keep.has(ts));
    for (const ts of this.queued) if (!keep.has(ts)) this.queued.delete(ts);
    this.notify();
  }

  dispose(): void {
    this.disposed = true;
    for (const bmp of this.bitmaps.values()) bmp.close();
    this.bitmaps.clear();
    this.blobs.clear();
    this.queue = [];
    this.queued.clear();
    this.listeners.clear();
  }
}
