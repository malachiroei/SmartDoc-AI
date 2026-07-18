"use client";

import { useState } from "react";
import {
  FolderPlus,
  FolderOpen,
  MousePointer2,
  Loader2,
  Mail,
} from "lucide-react";
import type { ClassificationResult, DocType, RoutingRule } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { docTypeHe, he } from "@/lib/i18n/he";
import { makeScanFileBase } from "@/lib/drive/filename";
import { ClassificationBadge } from "./ClassificationBadge";

const DOC_TYPE_OPTIONS: DocType[] = [
  "Invoice",
  "Receipt",
  "Bill",
  "Contract",
  "ID_Card",
  "Passport",
  "Driver_License",
  "Car_License",
  "Insurance",
  "Certificate",
  "Other",
];

type Props = {
  open: boolean;
  classification: ClassificationResult;
  rule: RoutingRule | null;
  busy?: boolean;
  onFileExisting: (corrected: ClassificationResult, fileBase: string) => void;
  onCreateNew: (corrected: ClassificationResult, fileBase: string) => void;
  onManual: (corrected: ClassificationResult, fileBase: string) => void;
  onEmailOnly?: (corrected: ClassificationResult, fileBase: string) => void;
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
  onEmailOnly,
  onClose,
}: Props) {
  const [docType, setDocType] = useState<DocType>(classification.doc_type);
  const [vendor, setVendor] = useState(classification.vendor);
  const [fileBase, setFileBase] = useState(makeScanFileBase(classification));

  const showExisting =
    !!rule &&
    !rule.is_autonomous &&
    rule.confirmation_count >= 1 &&
    rule.confirmation_count < 3;

  const personalTypes = new Set([
    "ID",
    "ID_Card",
    "Passport",
    "Driver_License",
    "Car_License",
    "Insurance",
    "Certificate",
  ]);

  const buildCorrected = (): ClassificationResult => {
    const isPersonal = personalTypes.has(docType);
    return {
      ...classification,
      doc_type: docType,
      vendor: vendor.replace(/\s+/g, "_") || classification.vendor,
      is_personal_doc: isPersonal,
      is_unpaid_bill: isPersonal ? false : classification.is_unpaid_bill,
      suggested_folder_name: isPersonal
        ? "מסמכים אישיים"
        : classification.suggested_folder_name,
    };
  };

  const typeLabel = docTypeHe(docType);
  const resolvedFileBase =
    fileBase.trim() || makeScanFileBase(buildCorrected());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={he.routing.title(typeLabel, vendor || classification.vendor)}
      subtitle={he.routing.confidence(
        Math.round(classification.confidence * 100),
        classification.summary
      )}
      wide
    >
      <div className="space-y-4" dir="rtl">
        <ClassificationBadge
          classification={{
            ...classification,
            doc_type: docType,
            vendor: vendor || classification.vendor,
          }}
        />

        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 space-y-3">
          <p className="text-sm font-medium text-amber-100">
            {he.routing.correctTitle}
          </p>
          <p className="text-[11px] text-[var(--fg-muted)]">
            {he.routing.correctHint}
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-xs space-y-1.5">
              <span className="text-[var(--fg-muted)]">
                {he.routing.correctDocType}
              </span>
              <select
                value={docType}
                disabled={busy}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--ink)]/70 px-3 py-2.5 text-sm text-[var(--fg)] outline-none focus:border-teal-400/50"
              >
                {DOC_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {docTypeHe(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs space-y-1.5">
              <span className="text-[var(--fg-muted)]">
                {he.routing.correctVendor}
              </span>
              <input
                type="text"
                value={vendor}
                disabled={busy}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--ink)]/70 px-3 py-2.5 text-sm text-[var(--fg)] outline-none focus:border-teal-400/50"
                dir="ltr"
              />
            </label>
          </div>
          <label className="block text-xs space-y-1.5">
            <span className="text-[var(--fg-muted)]">{he.routing.fileName}</span>
            <input
              type="text"
              value={fileBase}
              disabled={busy}
              onChange={(e) => setFileBase(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--ink)]/70 px-3 py-2.5 text-sm text-[var(--fg)] outline-none focus:border-teal-400/50"
            />
            <span className="text-[10px] text-[var(--fg-muted)]">
              {he.routing.fileNameHint}
            </span>
          </label>
        </div>

        {rule && !rule.is_autonomous && (
          <p className="text-xs text-[var(--fg-muted)]">
            {he.routing.memory(rule.confirmation_count)}
          </p>
        )}

        <div className="space-y-2">
          {onEmailOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onEmailOnly(buildCorrected(), resolvedFileBase)}
              className={cn(
                "w-full rounded-2xl border border-sky-400/40 bg-sky-400/10 p-4 text-start",
                "hover:border-sky-400 transition-colors disabled:opacity-50"
              )}
            >
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-sky-300 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-sm leading-relaxed">
                    {he.routing.optionEmail}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                    {he.routing.optionEmailHint}
                  </p>
                </div>
              </div>
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => onCreateNew(buildCorrected(), resolvedFileBase)}
            className={cn(
              "w-full rounded-2xl border border-teal-400/40 bg-teal-400/10 p-4 text-start",
              "hover:border-teal-400 transition-colors disabled:opacity-50"
            )}
          >
            <div className="flex items-start gap-3">
              <FolderPlus className="h-5 w-5 text-teal-300 mt-0.5 shrink-0" />
              <div className="font-medium text-sm leading-relaxed">
                {he.routing.optionCreate(
                  buildCorrected().suggested_folder_name
                )}
              </div>
            </div>
          </button>

          {showExisting && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onFileExisting(buildCorrected(), resolvedFileBase)}
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

          <button
            type="button"
            disabled={busy}
            onClick={() => onManual(buildCorrected(), resolvedFileBase)}
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
