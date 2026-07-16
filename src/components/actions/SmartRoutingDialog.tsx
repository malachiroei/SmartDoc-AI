"use client";

import { FolderPlus, FolderOpen, MousePointer2, Sparkles, Loader2 } from "lucide-react";
import type { ClassificationResult, RoutingRule } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

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
    !!rule && !rule.is_autonomous && rule.confirmation_count < 3;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Smart Routing"
      subtitle={`${Math.round(classification.confidence * 100)}% confidence · ${classification.summary}`}
      wide
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-teal-400/25 bg-teal-400/10 px-4 py-3 flex gap-3">
          <Sparkles className="h-5 w-5 text-teal-300 shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">
            I identified this as a{" "}
            <span className="font-semibold text-teal-100">
              {classification.vendor}
            </span>{" "}
            <span className="font-semibold text-teal-100">
              {classification.doc_type}
            </span>
            .
          </p>
        </div>

        {rule && !rule.is_autonomous && (
          <p className="text-xs text-[var(--fg-muted)] font-[family-name:var(--font-mono)]">
            Memory: confirmation {rule.confirmation_count}/3 toward autonomous
            filing
          </p>
        )}

        <div className="space-y-2">
          {showExisting && (
            <button
              type="button"
              disabled={busy}
              onClick={onFileExisting}
              className={cn(
                "w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left",
                "hover:border-teal-400/60 transition-colors disabled:opacity-50"
              )}
            >
              <div className="flex items-start gap-3">
                <FolderOpen className="h-5 w-5 text-teal-300 mt-0.5" />
                <div>
                  <div className="font-medium text-sm">
                    File under existing folder: {rule!.target_folder_name}?
                  </div>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    Option 1 · Reuse learned location (strike{" "}
                    {rule!.confirmation_count + 1}/3)
                  </p>
                </div>
              </div>
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={onCreateNew}
            className={cn(
              "w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left",
              "hover:border-teal-400/60 transition-colors disabled:opacity-50"
            )}
          >
            <div className="flex items-start gap-3">
              <FolderPlus className="h-5 w-5 text-teal-300 mt-0.5" />
              <div>
                <div className="font-medium text-sm">
                  Create a NEW folder named{" "}
                  {classification.suggested_folder_name} and file it there?
                </div>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  Option 2 · Teach SmartDoc this destination
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onManual}
            className={cn(
              "w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left",
              "hover:border-teal-400/60 transition-colors disabled:opacity-50"
            )}
          >
            <div className="flex items-start gap-3">
              <MousePointer2 className="h-5 w-5 text-teal-300 mt-0.5" />
              <div>
                <div className="font-medium text-sm">Manual select folder</div>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  Option 3 · Fall back to Drive picker / email actions
                </p>
              </div>
            </div>
          </button>
        </div>

        {busy && (
          <div className="flex items-center justify-center gap-2 text-sm text-[var(--fg-muted)] py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Filing…
          </div>
        )}
      </div>
    </Modal>
  );
}
