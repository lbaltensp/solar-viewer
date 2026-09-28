"use client";

export const FPS_OPTIONS = [8, 12, 24, 30, 60] as const;
export const WINDOW_OPTIONS = [
  { minutes: 60, label: "1 h" },
  { minutes: 180, label: "3 h" },
  { minutes: 360, label: "6 h" },
] as const;

export interface ControlsProps {
  playing: boolean;
  onTogglePlay: () => void;
  fps: number;
  onFpsChange: (fps: number) => void;
  windowMinutes: number;
  onWindowChange: (minutes: number) => void;
}

const selectClass =
  "rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 focus:border-neutral-400 focus:outline-none";

export function Controls({ playing, onTogglePlay, fps, onFpsChange, windowMinutes, onWindowChange }: ControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-300">
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-600 hover:border-neutral-300 hover:text-white"
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <rect x="2" y="1" width="3" height="10" />
            <rect x="7" y="1" width="3" height="10" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
            <path d="M2 1 L11 6 L2 11 Z" />
          </svg>
        )}
      </button>

      <label className="flex items-center gap-1.5">
        <span className="text-neutral-500">speed</span>
        <select className={selectClass} value={fps} onChange={(e) => onFpsChange(Number(e.target.value))}>
          {FPS_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-neutral-500">window</span>
        <select className={selectClass} value={windowMinutes} onChange={(e) => onWindowChange(Number(e.target.value))}>
          {WINDOW_OPTIONS.map((w) => (
            <option key={w.minutes} value={w.minutes}>
              {w.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
