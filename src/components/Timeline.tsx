"use client";

import { formatUtc } from "@/lib/frames";

export interface TimelineProps {
  frames: readonly number[];
  index: number;
  loadedCount: number;
  onSeek: (index: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export function Timeline({ frames, index, loadedCount, onSeek, onScrubStart, onScrubEnd }: TimelineProps) {
  const n = frames.length;
  const ts = frames[index];
  const loadedPct = n ? Math.round((loadedCount / n) * 100) : 0;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between font-mono text-xs text-neutral-400">
        <span className="text-neutral-200">{ts !== undefined ? formatUtc(ts) : "—"}</span>
        <span>
          {n ? `${index + 1} / ${n}` : "no frames"}
          {n && loadedCount < n ? <span className="ml-2 text-neutral-500">loading {loadedPct}%</span> : null}
        </span>
      </div>

      <div className="relative mt-1.5 h-6">
        {/* loaded progress under the slider */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded bg-neutral-800">
          <div className="h-full rounded bg-neutral-500 transition-[width]" style={{ width: `${loadedPct}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          value={Math.min(index, Math.max(0, n - 1))}
          onChange={(e) => onSeek(Number(e.target.value))}
          onPointerDown={onScrubStart}
          onPointerUp={onScrubEnd}
          onKeyDown={onScrubStart}
          onKeyUp={onScrubEnd}
          disabled={n === 0}
          aria-label="Frame"
          className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent accent-neutral-200 disabled:cursor-default"
        />
      </div>
    </div>
  );
}
