/**
 * Pure helpers for the frame timeline and playback. No DOM, no network, so
 * everything here is unit-testable.
 */

import type { FrameSize } from "./helioviewer";

/** Merge two timestamp lists, drop anything older than `minTs`, return ascending unique. */
export function mergeTimestamps(existing: readonly number[], incoming: readonly number[], minTs: number): number[] {
  const set = new Set<number>();
  for (const t of existing) if (t >= minTs) set.add(t);
  for (const t of incoming) if (t >= minTs) set.add(t);
  return [...set].sort((a, b) => a - b);
}

export interface Gap {
  /** Index of the frame before the gap. */
  afterIndex: number;
  from: number;
  to: number;
  seconds: number;
}

/** Find spacings larger than `factor` cadences. Used to badge data gaps (eclipse season, calibrations). */
export function findGaps(frames: readonly number[], cadenceSeconds: number, factor = 3): Gap[] {
  const gaps: Gap[] = [];
  const threshold = cadenceSeconds * factor;
  for (let i = 0; i < frames.length - 1; i++) {
    const dt = frames[i + 1] - frames[i];
    if (dt > threshold) gaps.push({ afterIndex: i, from: frames[i], to: frames[i + 1], seconds: dt });
  }
  return gaps;
}

export type Direction = 1 | -1;

/**
 * Advance one step in ping-pong order over `length` frames: forward to the end,
 * then backward to the start, and so on. There is no seam because the last
 * frame is followed by the second-to-last.
 */
export function pingPongStep(index: number, dir: Direction, length: number): { index: number; dir: Direction } {
  if (length <= 1) return { index: 0, dir };
  let next = index + dir;
  if (next >= length) {
    next = length - 2;
    dir = -1;
  } else if (next < 0) {
    next = 1;
    dir = 1;
  }
  return { index: next, dir };
}

/** URL of one frame on our own API. */
export function frameUrl(channel: number, ts: number, size: FrameSize): string {
  return `/api/frame/${channel}/${ts}?size=${size}`;
}

/**
 * How many decoded bitmaps to keep in memory (RGBA bytes = size² × 4).
 * At 2048 px each bitmap is ~16.8 MB, so the ~400 MB budget holds 23 frames:
 * enough for the decode-ahead window in both directions with margin.
 */
export function decodedCacheLimit(size: FrameSize): number {
  return Math.max(8, Math.floor(400e6 / (size * size * 4)));
}

/** "41 min", "1 h 15 min", "2 d 3 h" style relative durations. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h} h ${rem} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

/** UTC timestamp for the overlay, e.g. "2026-09-22 18:56:57 UTC". */
export function formatUtc(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
