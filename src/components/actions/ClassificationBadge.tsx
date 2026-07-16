"use client";

import { Sparkles } from "lucide-react";
import type { ClassificationResult } from "@/lib/types";
import { docTypeHe } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

type Props = {
  classification: ClassificationResult;
  className?: string;
  compact?: boolean;
};

/** Prominent AI classification card — vendor, doc_type, summary */
export function ClassificationBadge({
  classification,
  className,
  compact,
}: Props) {
  const typeLabel = docTypeHe(classification.doc_type);
  const confidence = Math.round(classification.confidence * 100);

  if (compact) {
    return (
      <div
        className={cn(
          "rounded-xl border border-teal-400/30 bg-teal-400/10 px-3 py-2",
          className
        )}
        dir="rtl"
      >
        <span className="font-bold text-teal-100">{typeLabel}</span>
        <span className="text-teal-200/80"> של </span>
        <span className="font-bold text-teal-100">{classification.vendor}</span>
        <span className="text-[var(--fg-muted)] text-xs"> · {classification.summary}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-teal-400/35 bg-gradient-to-l from-teal-400/15 to-teal-400/5 px-4 py-3.5",
        className
      )}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-400/20 text-teal-300">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-teal-300/80 mb-1">
            זיהוי AI
          </p>
          <p className="text-base leading-snug">
            <span className="font-bold text-teal-50">{typeLabel}</span>
            <span className="text-teal-200/90 font-medium"> של </span>
            <span className="font-bold text-teal-50">{classification.vendor}</span>
          </p>
          <p className="mt-1.5 text-sm font-medium text-[var(--fg)]">
            {classification.summary}
          </p>
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            {confidence}% ביטחון בזיהוי
          </p>
        </div>
      </div>
    </div>
  );
}
