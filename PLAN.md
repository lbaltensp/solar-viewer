# Solar Viewer — Build Plan

Near-real-time viewer of the Sun in SDO/AIA wavelengths, deployable on Vercel.
Data source: Helioviewer API (https://api.helioviewer.org/docs/v2/), which serves
NASA SDO images. Measured on 2026-09-22:

| Fact | Measured value | Consequence |
|---|---|---|
| AIA cadence on Helioviewer | 36 s (100 frames/hour) | smooth movie possible |
| Latency behind real time | ~75 min | label the UI "near real time", show frame timestamp |
| Browser CORS | not allowed | all requests go through our own API routes |
| Frame list for a time range | `getJPX?jpip=true&verbose=true` returns 100 unix timestamps in one call | one request per hour of timeline |
| PNG of one frame (1024 px) | `takeScreenshot` — 2.8 s, ~950 KB | proxy + cache + re-encode to WebP |
| PNG of one frame (2048 px) | ~7–9 s, ~3.5 MB → ~230 KB WebP q85 | **chosen size (2026-09-23)**; 4096 takes ~20 s, too close to the timeout |
| Frame ids | immutable | cache frames forever at the edge |
| NASA "latest" JPG | only 1 frame / ~10 min, was 30 h stale during eclipse season | fallback only, not primary |

## Architecture (fits Vercel's serverless model)

Vercel has no long-running process, so there is no background poller. Instead:

1. The browser asks our API for the frame timeline of the last N minutes.
2. For each frame it requests `/api/frame/<channel>/<timestamp>` from our own domain.
3. That route fetches the PNG from Helioviewer, converts to WebP (~4x smaller),
   and returns it with `Cache-Control: public, s-maxage=31536000, immutable`.
   Vercel's edge cache then serves every other visitor without touching Helioviewer.
4. The client keeps a 3-hour ring buffer (~300 frames), polls the timeline every
   3 min re-querying the last 15 min (Helioviewer back-fills late frames), dedupes,
   and plays on a `<canvas>` in ping-pong (forward, then backward) so there is no
   loop seam. Gaps > 3 cadences are held briefly and badged. Per-frame brightness
   is normalised to a running median.

Full 12 s cadence is NOT available near real time: Helioviewer stores every third
frame (36 s); JSOC's definitive `aia.lev1` lags ~4 days and its NRT series is not
publicly queryable (checked 2026-09-22). 36 s is the design cadence.

```
Browser ──> /api/timeline?ch=171&minutes=60 ──> Helioviewer getJPX (verbose)
        ──> /api/frame/171/1790096433      ──> Helioviewer takeScreenshot ──> WebP
              (edge-cached forever)
```

Optional later: a Vercel Cron job every 5 min that pre-warms the newest frames so
the first visitor never waits.

## Stack

- **Next.js 15, App Router, TypeScript** — Vercel's native framework, route handlers for the proxy.
- **sharp** — PNG → WebP re-encode in the route handler (works on Vercel Node runtime).
- **Tailwind** — minimal UI styling.
- **Vitest** — unit tests for timeline math, gap detection, normalisation.
- No database. Edge cache is the storage. Add Vercel KV/Blob only if pre-warming is needed.

## Folder structure

```
solar-viewer/
├── PLAN.md
├── README.md
├── package.json
├── next.config.ts
├── tsconfig.json
├── vercel.json                  # function maxDuration, optional cron
├── .env.example                 # HELIOVIEWER_BASE_URL, default channel, etc.
├── public/
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx             # the viewer page
│   │   ├── globals.css
│   │   └── api/
│   │       ├── timeline/route.ts          # GET ?ch=171&minutes=60 → { frames: [ts...] }
│   │       └── frame/[ch]/[ts]/route.ts   # GET → image/webp, cached immutable
│   ├── components/
│   │   ├── SunPlayer.tsx        # canvas, playback loop, crossfade
│   │   ├── ChannelPicker.tsx    # 94 / 131 / 171 / 193 / 211 / 304 / 335 / 1600 / 1700
│   │   ├── Timeline.tsx         # scrubber + frame timestamp + latency badge
│   │   └── Controls.tsx         # play/pause, speed, window length
│   ├── lib/
│   │   ├── helioviewer.ts       # typed client: sourceId map, buildScreenshotUrl, fetchTimeline
│   │   ├── channels.ts          # wavelength ↔ Helioviewer sourceId ↔ display colour/name
│   │   ├── frames.ts            # sliding buffer, gap detection, dedupe
│   │   ├── normalize.ts         # per-frame brightness normalisation (canvas ImageData)
│   │   └── cache.ts             # Cache-Control header helpers
│   └── hooks/
│       ├── useTimeline.ts       # polls /api/timeline every 3–5 min
│       └── useFramePreloader.ts # loads images ahead of the playhead
└── tests/
    ├── frames.test.ts
    └── normalize.test.ts
```

## Phases

**Phase 1 — data path (no UI). DONE 2026-09-22.** Verified locally: timeline returns
36 s frames with latency reported; 1024 px frame → 62 KB WebP from a 943 KB PNG in ~3.9 s;
`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass on Next 16.3.
`lib/helioviewer.ts`, the two API routes, WebP re-encode, cache headers.
Done when `curl localhost:3000/api/timeline?ch=171&minutes=60` returns ~100 timestamps
and `/api/frame/171/<ts>` returns a WebP under 300 KB.

**Phase 2 — player. DONE 2026-09-22.**
`SunPlayer` on canvas with ping-pong playback, `FrameStore` (compressed blobs for the
whole window + bounded LRU of decoded ImageBitmaps, decode-ahead of 16 frames),
`useTimeline` (3-min poll, latency-aware window, back-fill overlap), channel picker,
speed/window controls, scrubber with UTC timestamp, keyboard (space, ←/→).
Verified headlessly with Playwright: 101 frames/h at 36 s, playhead bounces, canvas
painted, channel switch resumes within the loaded run, no console errors.
Lessons: React StrictMode double-mounts, so never dispose a memoised store in an effect
cleanup; download priority and playable range must agree (both follow the playhead).
Deferred to Phase 3: per-frame loaded segments on the scrubber (currently a % bar),
brightness normalisation, gap badges, crossfade on hold.

**Phase 3 — continuity polish.**
Brightness normalisation per frame, gap detection (skip or hold when spacing > 3 cadences),
sliding window that appends new frames without restarting playback.

**Phase 4 — deploy.**
`vercel.json` with `maxDuration: 30` for the frame route, connect the GitHub repo,
deploy. Verify edge cache hits in Vercel logs. Optional cron pre-warm.

## Constraints to respect

- Helioviewer is a free community service: poll the timeline no more than every 3 min,
  never fetch a frame twice (edge cache guarantees this), set a descriptive User-Agent,
  and keep parallel frame downloads at 8 (measured: 12 only gains ~20% while doubling load).
- Vercel Hobby: 100 GB bandwidth/month, 10 s default function timeout (raise to 30 s
  for the frame route since `takeScreenshot` takes ~3 s).
- Credit "Courtesy of NASA/SDO and the AIA science team; images via Helioviewer.org" in the footer.
- Not live: always display the frame's real timestamp and "≈ 75 min behind real time".
