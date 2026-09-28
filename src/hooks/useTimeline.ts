"use client";

/**
 * Keeps an up-to-date list of frame timestamps for one channel.
 *
 * Helioviewer lags real time by 40–90 min, so "the last 3 hours of data" is
 * not "the last 3 hours of wall-clock time". The first request therefore asks
 * for the window plus generous latency headroom and trims client-side to the
 * newest frame. Refreshes every POLL_MS re-query from a bit before the newest
 * known frame up to now, because Helioviewer back-fills late frames.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeTimestamps } from "@/lib/frames";

const POLL_MS = 3 * 60 * 1000;
const LATENCY_HEADROOM_MIN = 90;
const REFRESH_OVERLAP_MIN = 15;
const API_MAX_MINUTES = 12 * 60;

interface TimelineResponse {
  frames: number[];
  newest: number | null;
  latencySeconds: number | null;
  cadenceSeconds: number;
  error?: string;
}

export interface TimelineState {
  frames: number[];
  newest: number | null;
  latencySeconds: number | null;
  cadenceSeconds: number;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export function useTimeline(channel: number, windowMinutes: number): TimelineState & { refresh: () => void } {
  const [state, setState] = useState<TimelineState>({
    frames: [],
    newest: null,
    latencySeconds: null,
    cadenceSeconds: 36,
    loading: true,
    error: null,
    lastUpdated: null,
  });
  const framesRef = useRef<number[]>([]);
  const newestRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Reset when the channel or window changes so we never mix channels.
  useEffect(() => {
    framesRef.current = [];
    newestRef.current = null;
    setState((s) => ({ ...s, frames: [], newest: null, loading: true, error: null }));
  }, [channel, windowMinutes]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      const nowSec = Math.floor(Date.now() / 1000);
      const known = newestRef.current;
      const minutes =
        known === null
          ? Math.min(API_MAX_MINUTES, windowMinutes + LATENCY_HEADROOM_MIN)
          : Math.min(API_MAX_MINUTES, Math.ceil((nowSec - known) / 60) + REFRESH_OVERLAP_MIN);

      try {
        const res = await fetch(`/api/timeline?ch=${channel}&minutes=${minutes}`, { signal: controller.signal });
        const body = (await res.json()) as TimelineResponse;
        if (cancelled) return;
        if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);

        const newest = Math.max(body.newest ?? 0, known ?? 0) || null;
        const minTs = newest ? newest - windowMinutes * 60 : 0;
        const merged = mergeTimestamps(framesRef.current, body.frames, minTs);
        framesRef.current = merged;
        newestRef.current = newest;

        setState({
          frames: merged,
          newest,
          latencySeconds: newest ? nowSec - newest : null,
          cadenceSeconds: body.cadenceSeconds ?? 36,
          loading: false,
          error: merged.length === 0 ? "No frames available yet" : null,
          lastUpdated: nowSec,
        });
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Timeline failed" }));
      }
    }

    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [channel, windowMinutes, tick]);

  return { ...state, refresh };
}
