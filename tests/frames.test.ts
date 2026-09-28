import { describe, expect, it } from "vitest";
import {
  decodedCacheLimit,
  findGaps,
  formatDuration,
  formatUtc,
  frameUrl,
  mergeTimestamps,
  pingPongStep,
} from "@/lib/frames";

describe("mergeTimestamps", () => {
  it("unions, dedupes, sorts, and drops frames older than minTs", () => {
    expect(mergeTimestamps([100, 136, 172], [172, 208, 64], 100)).toEqual([100, 136, 172, 208]);
  });
  it("handles empty inputs", () => {
    expect(mergeTimestamps([], [], 0)).toEqual([]);
  });
});

describe("findGaps", () => {
  it("flags spacings above the threshold", () => {
    const frames = [0, 36, 72, 500, 536];
    const gaps = findGaps(frames, 36, 3);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ afterIndex: 2, from: 72, to: 500, seconds: 428 });
  });
  it("ignores normal cadence jitter", () => {
    expect(findGaps([0, 36, 73, 108, 145], 36, 3)).toEqual([]);
  });
});

describe("pingPongStep", () => {
  it("walks forward then reverses without repeating the end frame", () => {
    const seq: number[] = [];
    let s = { index: 0, dir: 1 as 1 | -1 };
    for (let i = 0; i < 8; i++) {
      s = pingPongStep(s.index, s.dir, 4);
      seq.push(s.index);
    }
    expect(seq).toEqual([1, 2, 3, 2, 1, 0, 1, 2]);
  });
  it("stays put with fewer than two frames", () => {
    expect(pingPongStep(0, 1, 1)).toEqual({ index: 0, dir: 1 });
    expect(pingPongStep(0, 1, 0)).toEqual({ index: 0, dir: 1 });
  });
  it("copes with an index beyond the current length", () => {
    // playable length can shrink if the window moves; must not go out of range
    const s = pingPongStep(10, 1, 4);
    expect(s.index).toBeGreaterThanOrEqual(0);
    expect(s.index).toBeLessThan(4);
  });
});

describe("sizing", () => {
  it("keeps the decoded cache near 400 MB", () => {
    const n = decodedCacheLimit(2048);
    expect(n).toBe(23);
    expect(n * 2048 * 2048 * 4).toBeLessThanOrEqual(400e6);
  });
});

describe("formatting", () => {
  it("builds frame urls", () => {
    expect(frameUrl(171, 1790103417, 2048)).toBe("/api/frame/171/1790103417?size=2048");
  });
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(2459)).toBe("41 min");
    expect(formatDuration(4500)).toBe("1 h 15 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(100_000)).toBe("1 d 3 h");
  });
  it("formats UTC timestamps", () => {
    expect(formatUtc(1790103417)).toBe("2026-09-22 18:56:57 UTC");
  });
});
