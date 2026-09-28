"use client";

import { CHANNELS } from "@/lib/channels";

export interface ChannelPickerProps {
  value: number;
  onChange: (wavelength: number) => void;
}

export function ChannelPicker({ value, onChange }: ChannelPickerProps) {
  return (
    <div role="radiogroup" aria-label="Wavelength" className="flex flex-wrap gap-1.5">
      {CHANNELS.map((c) => {
        const active = c.wavelength === value;
        return (
          <button
            key={c.wavelength}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${c.name} — ${c.description}`}
            onClick={() => onChange(c.wavelength)}
            className={
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-mono transition-colors " +
              (active
                ? "border-neutral-300 bg-neutral-100 text-neutral-900"
                : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-neutral-100")
            }
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.accent }} />
            {c.wavelength}
          </button>
        );
      })}
    </div>
  );
}
