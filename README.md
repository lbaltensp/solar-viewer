# Solar Viewer

A near-real-time viewer of the Sun in SDO/AIA wavelengths, built to deploy on Vercel.
Images come from NASA's Solar Dynamics Observatory via the [Helioviewer API](https://api.helioviewer.org/docs/v2/).

See `PLAN.md` for the architecture and phases.

## Status

Phases 1 and 2 are done: the API routes proxy Helioviewer and re-encode frames to WebP
with edge-cache headers, and the canvas player plays the last 1–6 h of any AIA channel in
ping-pong order with a scrubber, speed control and keyboard shortcuts. Phase 3 adds
brightness normalisation and gap handling; Phase 4 is the Vercel deploy.

## Run locally

```bash
pnpm install
pnpm dev
```

Then:

```bash
# frame timestamps for the last hour of AIA 171
curl -s 'http://localhost:3000/api/timeline?ch=171&minutes=60' | jq '{count, newestIso, latencySeconds}'

# one 2048 px frame as WebP (take a timestamp from the list above)
curl -s -o frame.webp -D - 'http://localhost:3000/api/frame/171/1790096433'
```

## Test

```bash
pnpm test
```

## Attribution

Images courtesy of NASA/SDO and the AIA science team, served via Helioviewer.org.
Helioviewer is a free community service: this app polls its timeline no more often
than every few minutes and never fetches the same frame twice (edge cache).
