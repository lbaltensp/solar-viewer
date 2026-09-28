/**
 * GET /api/frame/171/1790096433
 *
 * Proxies one 2048 px AIA frame from Helioviewer, re-encodes PNG → WebP (about
 * 14x smaller), and marks it immutable so Vercel's edge serves every repeat
 * request without touching Helioviewer. Timestamps should come from
 * /api/timeline so they land exactly on stored frames.
 */

import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { parseChannel } from "@/lib/channels";
import {
  DEFAULT_FRAME_SIZE,
  FRAME_SIZES,
  fetchFramePng,
  HelioviewerError,
  type FrameSize,
} from "@/lib/helioviewer";
import { immutableHeaders, noStoreHeaders } from "@/lib/cache";

export const runtime = "nodejs";
// A 2048 px takeScreenshot takes ~9 s upstream; leave headroom for slow days. Vercel Hobby allows up to 60.
export const maxDuration = 45;

const WEBP_QUALITY = 85;
// SDO first light was 2010-03-30. Anything earlier is a typo.
const MIN_TS = Date.UTC(2010, 4, 1) / 1000;

function parseSize(raw: string | null): FrameSize {
  const n = Number.parseInt(raw ?? "", 10);
  return (FRAME_SIZES as readonly number[]).includes(n) ? (n as FrameSize) : DEFAULT_FRAME_SIZE;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ch: string; ts: string }> },
) {
  const { ch, ts } = await params;

  const channel = parseChannel(ch);
  if (!channel) {
    return NextResponse.json({ error: `Unknown channel '${ch}'` }, { status: 400, headers: noStoreHeaders() });
  }

  const unix = Number.parseInt(ts, 10);
  const maxTs = Math.floor(Date.now() / 1000) + 86400;
  if (!Number.isFinite(unix) || unix < MIN_TS || unix > maxTs) {
    return NextResponse.json({ error: `Invalid timestamp '${ts}'` }, { status: 400, headers: noStoreHeaders() });
  }

  const size = parseSize(request.nextUrl.searchParams.get("size"));

  try {
    const png = await fetchFramePng(channel, unix, size);
    const webp = await sharp(png).webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer();

    return new NextResponse(new Uint8Array(webp), {
      status: 200,
      headers: {
        ...immutableHeaders(),
        "Content-Type": "image/webp",
        "Content-Length": String(webp.byteLength),
        "X-Frame-Channel": String(channel.wavelength),
        "X-Frame-Timestamp": new Date(unix * 1000).toISOString(),
        "X-Frame-Size": String(size),
        "X-Source-Bytes": String(png.byteLength),
      },
    });
  } catch (err) {
    const status = err instanceof HelioviewerError ? 502 : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status, headers: noStoreHeaders() });
  }
}
