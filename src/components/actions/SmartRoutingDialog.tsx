"use client";

import {
  FolderPlus,
  FolderOpen,
  MousePointer2,
  Loader2,
} from "lucide-react";
import type { ClassificationResult, RoutingRule } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { docTypeHe, he } from "@/lib/i18n/he";
import { ClassificationBadge } from "./ClassificationBadge";

type Props = {
  open: boolean;
  classification: ClassificationResult;
  rule: RoutingRule | null;
  busy?: boolean;
  onFileExisting: () => void;
  onCreateNew: () => void;
  onManual: () => void;
  onClose: () => void;
};

export function SmartRoutingDialog({
  open,
  classification,
  rule,
  busy,
  onFileExisting,
  onCreateNew,
  onManual,
  onClose,
}: Props) {
  const showExisting =
    !!rule && !rule.is_autonomous && rule.confirmation_count >= 1 && rule.confirmation_count < 3;

  const typeLabel = docTypeHe(classification.doc_type);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={he.routing.title(typeLabel, classification.vendor)}
      subtitle={he.routing.confidence(
        Math.round(classification.confidence * 100),
        classification.summary
      )}
      wide
    >
      <div className="space-y-4" dir="rtl">
        <ClassificationBadge classification={classification} />

        {rule && !rule.is_autonomous && (
          <p className="text-xs text-[var(--fg-muted)]">
            {he.routing.memory(rule.confirmation_count)}
          </p>
        )}

        <div className="space-y-2">
          {/* Option A — Create new folder (primary teaching action) */}
          <button
            type="button"
            disabled={busy}
            onClick={onCreateNew}
            className={cn(
              "w-full rounded-2xl border border-teal-400/40 bg-teal-400/10 p-4 text-start",
              "hover:border-teal-400 transition-colors disabled:opacity-50"
            )}
          >
            <div className="flex items-start gap-3">
              <FolderPlus className="h-5 w-5 text-teal-300 mt-0.5 shrink-0" />
              <div className="font-medium text-sm leading-relaxed">
                {he.routing.optionCreate(classification.suggested_folder_name)}
              </div>
            </div>
          </button>

          {/* Option B — Existing rule (count 1 or 2) */}
          {showExisting && (
            <button
              type="button"
              disabled={busy}
              onClick={onFileExisting}
              className={cn(
                "w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-start",
                "hover:border-teal-400/60 transition-colors disabled:opacity-50"
              )}
            >
              <div className="flex items-start gap-3">
                <FolderOpen className="h-5 w-5 text-teal-300 mt-0.5 shrink-0" />
                <div className="font-medium text-sm leading-relaxed">
                  {he.routing.optionExisting(rule!.target_folder_name)}
                </div>
              </div>
            </button>
          )}

          {/* Option C — Manual Drive / Email */}
          <button
            type="button"
            disabled={busy}
            onClick={onManual}
            className={cn(
              "w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-start",
              "hover:border-teal-400/60 transition-colors disabled:opacity-50"
            )}
          >
            <div className="flex items-start gap-3">
              <MousePointer2 className="h-5 w-5 text-teal-300 mt-0.5 shrink-0" />
              <div className="font-medium text-sm leading-relaxed">
                {he.routing.optionManual}
              </div>
            </div>
          </button>
        </div>

        {busy && (
          <div className="flex items-center justify-center gap-2 text-sm text-[var(--fg-muted)] py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {he.routing.filing}
          </div>
        )}
      </div>
    </Modal>
  );
}
