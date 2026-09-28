"use client";

/**
 * Owns a FrameStore for the current channel and size, keeps it fed with the
 * current frame list, and exposes the loaded count for progress UI via
 * useSyncExternalStore (the store coalesces download bursts itself).
 *
 * Lifecycle note: the store is memoised on (channel, size). We dispose a store
 * only when a *different* one replaces it, never in an effect cleanup, because
 * React StrictMode runs mount → cleanup → mount with the same memoised instance
 * and a cleanup-dispose would kill the store that is still in use. The Viewer is
 * the app root and never unmounts, so the final store lives as long as the page.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { FrameStore } from "@/lib/frameStore";
import { decodedCacheLimit } from "@/lib/frames";
import type { FrameSize } from "@/lib/helioviewer";

export function useFrameStore(channel: number, size: FrameSize, frames: readonly number[]) {
  // A new channel or size means new URLs: rebuild the store.
  const store = useMemo(
    () => new FrameStore({ channel, size, maxDecoded: decodedCacheLimit(size) }),
    [channel, size],
  );

  const previousRef = useRef<FrameStore | null>(null);
  useEffect(() => {
    if (previousRef.current && previousRef.current !== store) previousRef.current.dispose();
    previousRef.current = store;
  }, [store]);

  // Keep the store in sync with the frame list: drop stale frames, request new ones.
  useEffect(() => {
    store.prune(new Set(frames));
    for (const ts of frames) store.request(ts);
  }, [store, frames]);

  const loadedCount = useSyncExternalStore(
    store.subscribe,
    () => store.loadedCount,
    () => 0,
  );

  return { store, loadedCount };
}
