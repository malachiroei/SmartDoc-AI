"use client";

import type { ScanFilter } from "@/lib/types";
import { FILTER_LABELS } from "@/lib/image/filters";
import { cn } from "@/lib/utils";

const FILTERS: ScanFilter[] = ["enhance", "original", "magic", "grayscale", "sharp"];

type Props = {
  value: ScanFilter;
  onChange: (filter: ScanFilter) => void;
  previewSrc?: string;
  /** Compact pill row for mobile one-screen layout */
  compact?: boolean;
};

export function FilterSelector({
  value,
  onChange,
  previewSrc,
  compact,
}: Props) {
  if (compact) {
    return (
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-[11px] transition-colors",
              value === f
                ? "border-teal-400/60 bg-teal-400/15 text-teal-100"
                : "border-[var(--border)] text-[var(--fg-muted)]"
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
      {FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={cn(
            "shrink-0 w-20 rounded-xl border overflow-hidden transition-all",
            value === f
              ? "border-teal-400 ring-2 ring-teal-400/40"
              : "border-[var(--border)] opacity-80 hover:opacity-100"
          )}
        >
          <div
            className={cn(
              "h-14 bg-[var(--surface-2)]",
              f === "enhance" && "contrast-125 brightness-105",
              f === "grayscale" && "grayscale",
              f === "magic" && "contrast-150 brightness-110 saturate-0",
              f === "sharp" && "contrast-125"
            )}
            style={
              previewSrc
                ? {
                    backgroundImage: `url(${previewSrc})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          />
          <div className="px-1 py-1.5 text-[10px] text-center text-[var(--fg-muted)] bg-[var(--surface)]">
            {FILTER_LABELS[f]}
          </div>
        </button>
      ))}
    </div>
  );
}
