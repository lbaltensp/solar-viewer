/**
 * Cache-Control helpers.
 *
 * Vercel's edge cache honours `s-maxage`. Frame ids are immutable, so a frame
 * fetched once is served from the edge for a year and Helioviewer is never asked
 * for it again. The timeline changes every 36 s upstream but we only need it
 * every few minutes, so it gets a short shared TTL.
 */

const ONE_YEAR = 60 * 60 * 24 * 365;

/** For content that never changes for a given URL, such as a frame at a fixed timestamp. */
export function immutableHeaders(): Record<string, string> {
  return {
    "Cache-Control": `public, max-age=86400, s-maxage=${ONE_YEAR}, immutable`,
  };
}

/** For content that updates on a schedule, such as the frame timeline. */
export function shortLivedHeaders(sharedSeconds = 120): Record<string, string> {
  return {
    "Cache-Control": `public, max-age=0, s-maxage=${sharedSeconds}, stale-while-revalidate=${sharedSeconds}`,
  };
}

/** Errors must never be cached, or a transient upstream failure would stick. */
export function noStoreHeaders(): Record<string, string> {
  return { "Cache-Control": "no-store" };
}
