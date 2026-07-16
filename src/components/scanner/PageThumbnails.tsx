"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ScannedPage } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  pages: ScannedPage[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
};

export function PageThumbnails({
  pages,
  activeId,
  onSelect,
  onRemove,
  onAdd,
}: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-1">
      {pages.map((page, i) => (
        <div key={page.id} className="relative shrink-0 group">
          <button
            type="button"
            onClick={() => onSelect(page.id)}
            className={cn(
              "block h-16 w-12 rounded-lg overflow-hidden border-2 transition-all",
              activeId === page.id
                ? "border-teal-400"
                : "border-transparent opacity-70 hover:opacity-100"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.processedDataUrl}
              alt={`Page ${i + 1}`}
              className="h-full w-full object-cover"
            />
          </button>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] bg-black/70 text-white px-1 rounded">
            {i + 1}
          </span>
          <button
            type="button"
            aria-label="Remove page"
            onClick={() => onRemove(page.id)}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="shrink-0 h-16 w-12 rounded-lg border border-dashed border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] flex items-center justify-center"
        aria-label="Add page"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}
