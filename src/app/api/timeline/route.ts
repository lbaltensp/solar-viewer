/**
 * GET /api/timeline?ch=171&minutes=60
 *
 * Returns the frame timestamps Helioviewer has for a channel in the requested
 * window ending now. Because Helioviewer lags real time by ~60–90 min, the
 * newest frame is typically an hour old; `latencySeconds` reports that so the
 * UI can show it honestly.
 */

import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_WAVELENGTH, getChannel, parseChannel } from "@/lib/channels";
import { CADENCE_SECONDS, fetchTimeline, HelioviewerError } from "@/lib/helioviewer";
import { noStoreHeaders, shortLivedHeaders } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 15;

const MIN_MINUTES = 5;
const MAX_MINUTES = 12 * 60;
const DEFAULT_MINUTES = 60;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;

  const channel = parseChannel(q.get("ch")) ?? getChannel(DEFAULT_WAVELENGTH)!;
  if (q.get("ch") && !parseChannel(q.get("ch"))) {
    return NextResponse.json({ error: `Unknown channel '${q.get("ch")}'` }, { status: 400, headers: noStoreHeaders() });
  }

  const minutesRaw = Number.parseInt(q.get("minutes") ?? String(DEFAULT_MINUTES), 10);
  const minutes = Number.isFinite(minutesRaw) ? Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutesRaw)) : DEFAULT_MINUTES;

  const nowUnix = Math.floor(Date.now() / 1000);
  const endUnix = nowUnix;
  const startUnix = endUnix - minutes * 60;

  try {
    const frames = await fetchTimeline(channel, startUnix, endUnix);
    const newest = frames.at(-1);

    return NextResponse.json(
      {
        channel: channel.wavelength,
        sourceId: channel.sourceId,
        cadenceSeconds: CADENCE_SECONDS,
        window: { start: startUnix, end: endUnix, minutes },
        count: frames.length,
        newest: newest ?? null,
        newestIso: newest ? new Date(newest * 1000).toISOString() : null,
        latencySeconds: newest ? nowUnix - newest : null,
        frames,
      },
      { headers: shortLivedHeaders(120) },
    );
  } catch (err) {
    const status = err instanceof HelioviewerError ? 502 : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status, headers: noStoreHeaders() });
  }
}
