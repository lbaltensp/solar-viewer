import { describe, expect, it } from "vitest";
import { getChannel, parseChannel } from "@/lib/channels";
import {
  imageScaleFor,
  layerString,
  normalizeFrames,
  screenshotUrl,
  timelineUrl,
  toHelioviewerDate,
} from "@/lib/helioviewer";

const aia171 = getChannel(171)!;

describe("channels", () => {
  it("parses wavelengths from loose input", () => {
    expect(parseChannel("171")?.sourceId).toBe(10);
    expect(parseChannel("0304")?.wavelength).toBe(304);
    expect(parseChannel("aia193")?.wavelength).toBe(193);
  });

  it("rejects unknown channels", () => {
    expect(parseChannel("172")).toBeUndefined();
    expect(parseChannel("")).toBeUndefined();
    expect(parseChannel(null)).toBeUndefined();
  });
});

describe("helioviewer url building", () => {
  it("formats dates without milliseconds", () => {
    expect(toHelioviewerDate(1790096433)).toBe("2026-09-22T17:00:33Z");
  });

  it("builds the AIA layer string", () => {
    expect(layerString(aia171)).toBe("[SDO,AIA,AIA,171,1,100]");
  });

  it("scales so the disk fits at 2048 px", () => {
    // 2048 px × 1.2"/px = 2458" field; the disk is ~1920" across.
    expect(imageScaleFor(2048)).toBeCloseTo(1.2);
  });

  it("builds a screenshot url with the expected parameters", () => {
    const url = new URL(screenshotUrl(aia171, 1790096433));
    expect(url.pathname).toMatch(/takeScreenshot\/$/);
    expect(url.searchParams.get("date")).toBe("2026-09-22T17:00:33Z");
    expect(url.searchParams.get("layers")).toBe("[SDO,AIA,AIA,171,1,100]");
    expect(url.searchParams.get("width")).toBe("2048");
    expect(url.searchParams.get("imageScale")).toBe("1.2");
    expect(url.searchParams.get("display")).toBe("true");
  });

  it("builds a timeline url that lists frames via getJPX verbose", () => {
    const url = new URL(timelineUrl(aia171, 1790096400, 1790100000));
    expect(url.pathname).toMatch(/getJPX\/$/);
    expect(url.searchParams.get("sourceId")).toBe("10");
    expect(url.searchParams.get("jpip")).toBe("true");
    expect(url.searchParams.get("verbose")).toBe("true");
  });
});

describe("normalizeFrames", () => {
  it("sorts, dedupes, and clips to the window", () => {
    const out = normalizeFrames([30, "20", 20, 10, 5, 99, NaN, "x"], 10, 40);
    expect(out).toEqual([10, 20, 30]);
  });

  it("returns an empty list for garbage", () => {
    expect(normalizeFrames(undefined, 0, 1)).toEqual([]);
    expect(normalizeFrames({ frames: [1] }, 0, 1)).toEqual([]);
  });
});
