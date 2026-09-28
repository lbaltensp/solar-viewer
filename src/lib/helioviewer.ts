/**
 * Typed client for the parts of the Helioviewer API we use.
 * Docs: https://api.helioviewer.org/docs/v2/
 *
 * Two endpoints matter:
 *  - getJPX (jpip=true, verbose=true): returns the list of frame timestamps in a
 *    time range in one call. We never download the JPX itself.
 *  - takeScreenshot (display=true): returns a PNG of one frame, colour table applied.
 *
 * Helioviewer stores AIA at 36 s cadence (every third exposure) and lags real
 * time by roughly 60 to 90 minutes. It is a free community service: keep polling
 * modest and identify ourselves with a User-Agent.
 */

import type { Channel } from "./channels";

export const HELIOVIEWER_BASE_URL =
  process.env.HELIOVIEWER_BASE_URL ?? "https://api.helioviewer.org/v2";

export const USER_AGENT =
  process.env.SOLAR_VIEWER_USER_AGENT ?? "solar-viewer/0.1 (personal near-real-time Sun viewer)";

/** Nominal spacing between consecutive AIA frames on Helioviewer, in seconds. */
export const CADENCE_SECONDS = 36;

/**
 * Output size. We serve 2048 px only: half of AIA's native 4096, sharp on Retina
 * displays, ~9 s to render upstream and ~250 KB as WebP. 4096 would take ~20 s
 * per frame and risk the serverless timeout; 1024 wastes the instrument.
 */
export const FRAME_SIZES = [2048] as const;
export type FrameSize = (typeof FRAME_SIZES)[number];
export const DEFAULT_FRAME_SIZE: FrameSize = 2048;

/**
 * Arcseconds per pixel at 1024 px. The solar disk is ~1920" across, so 2.4"/px
 * puts the disk at ~800 px with room for the off-limb corona.
 */
const ARCSEC_PER_PX_AT_1024 = 2.4;

const UPSTREAM_TIMEOUT_MS = 40_000;

export class HelioviewerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = "HelioviewerError";
  }
}

/** Format a unix-seconds timestamp as the ISO string Helioviewer expects (no milliseconds). */
export function toHelioviewerDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Helioviewer layer descriptor: [observatory,instrument,detector,measurement,visible,opacity]. */
export function layerString(channel: Channel): string {
  return `[SDO,AIA,AIA,${channel.wavelength},1,100]`;
}

export function imageScaleFor(size: FrameSize): number {
  return (ARCSEC_PER_PX_AT_1024 * 1024) / size;
}

/** Build the takeScreenshot URL for one frame. */
export function screenshotUrl(channel: Channel, unixSeconds: number, size: FrameSize = DEFAULT_FRAME_SIZE): string {
  const params = new URLSearchParams({
    date: toHelioviewerDate(unixSeconds),
    imageScale: imageScaleFor(size).toString(),
    layers: layerString(channel),
    x0: "0",
    y0: "0",
    width: String(size),
    height: String(size),
    display: "true",
    watermark: "false",
  });
  return `${HELIOVIEWER_BASE_URL}/takeScreenshot/?${params.toString()}`;
}

/** Build the getJPX URL used purely to list frame timestamps. */
export function timelineUrl(channel: Channel, startUnix: number, endUnix: number): string {
  const params = new URLSearchParams({
    startTime: toHelioviewerDate(startUnix),
    endTime: toHelioviewerDate(endUnix),
    sourceId: String(channel.sourceId),
    jpip: "true",
    verbose: "true",
  });
  return `${HELIOVIEWER_BASE_URL}/getJPX/?${params.toString()}`;
}

/**
 * Clean a raw frame list: integers only, deduplicated, ascending, inside [start, end].
 * Exported so it can be unit-tested without network access.
 */
export function normalizeFrames(raw: unknown, startUnix: number, endUnix: number): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const v of raw) {
    const n = typeof v === "string" ? Number.parseInt(v, 10) : v;
    if (typeof n !== "number" || !Number.isFinite(n)) continue;
    const ts = Math.round(n);
    if (ts < startUnix || ts > endUnix) continue;
    seen.add(ts);
  }
  return [...seen].sort((a, b) => a - b);
}

async function upstreamFetch(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    cache: "no-store",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new HelioviewerError(`Helioviewer responded ${res.status}`, res.status, url);
  }
  return res;
}

/** List the frame timestamps (unix seconds, ascending) available for a channel in a time range. */
export async function fetchTimeline(channel: Channel, startUnix: number, endUnix: number): Promise<number[]> {
  const url = timelineUrl(channel, startUnix, endUnix);
  const res = await upstreamFetch(url, "application/json");
  const body = (await res.json()) as { frames?: unknown; error?: string };
  if (body.error) throw new HelioviewerError(body.error, 502, url);
  return normalizeFrames(body.frames, startUnix, endUnix);
}

/** Download one frame as PNG bytes. */
export async function fetchFramePng(channel: Channel, unixSeconds: number, size: FrameSize): Promise<Buffer> {
  const url = screenshotUrl(channel, unixSeconds, size);
  const res = await upstreamFetch(url, "image/png");
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    // Helioviewer returns JSON with an error message when the request is bad.
    const text = await res.text();
    throw new HelioviewerError(`Expected an image, got ${type}: ${text.slice(0, 200)}`, 502, url);
  }
  return Buffer.from(await res.arrayBuffer());
}
