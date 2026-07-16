"use client";

import { Download, AlertTriangle, IdCard, FileText, Trash2, Eye } from "lucide-react";
import type { RetrieveDocumentCard } from "@/lib/types";
import { docTypeHe, he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";

type Props = {
  document: RetrieveDocumentCard;
  className?: string;
  onView?: (doc: RetrieveDocumentCard) => void;
  onDelete?: (doc: RetrieveDocumentCard) => void;
  deleting?: boolean;
};

function formatExpiry(doc: RetrieveDocumentCard): string {
  if (!doc.expiration_date) return he.vault.noExpiry;
  try {
    return new Date(doc.expiration_date).toLocaleDateString("he-IL");
  } catch {
    return doc.expiration_date;
  }
}

function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("data:image/") ||
    /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url) ||
    url.includes("googleusercontent") ||
    url.includes("/uc?export=")
  );
}

function viewUrl(doc: RetrieveDocumentCard): string | null {
  if (doc.file_url) return doc.file_url;
  if (doc.file_id && !doc.file_id.startsWith("demo-")) {
    return `https://drive.google.com/file/d/${doc.file_id}/view`;
  }
  return null;
}

function downloadUrl(doc: RetrieveDocumentCard): string | null {
  if (doc.file_url?.startsWith("data:")) return doc.file_url;
  if (doc.file_id && !doc.file_id.startsWith("demo-")) {
    return `https://drive.google.com/uc?export=download&id=${doc.file_id}`;
  }
  return doc.file_url;
}

function downloadFileName(doc: RetrieveDocumentCard): string {
  const base = (doc.title || "document").replace(/[\\/:*?"<>|]+/g, "_").trim();
  if (doc.file_url?.startsWith("data:image/png")) return `${base}.png`;
  if (doc.file_url?.startsWith("data:image/webp")) return `${base}.webp`;
  if (doc.file_url?.startsWith("data:image/")) return `${base}.jpg`;
  return `${base}.jpg`;
}

const linkBtn =
  "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium bg-[var(--surface-2)] text-[var(--fg)] border border-[var(--border)] hover:bg-[var(--surface-3)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export function VaultDocumentCard({
  document: doc,
  className,
  onView,
  onDelete,
  deleting,
}: Props) {
  const typeLabel = docTypeHe(doc.doc_type);
  const href = viewUrl(doc);
  const dlHref = downloadUrl(doc);
  const showImage = isImageUrl(doc.file_url);
  const canDelete = Boolean(onDelete) && doc.source !== "bill";

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden flex flex-col",
        className
      )}
      dir="rtl"
    >
      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete?.(doc)}
          disabled={deleting}
          title={he.vault.deleteDoc}
          aria-label={he.vault.deleteDoc}
          className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-lg border border-red-400/40 bg-red-500/20 px-2 py-1 text-xs font-medium text-red-100 backdrop-blur hover:bg-red-500/35 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleting ? he.vault.deleting : he.vault.deleteDoc}
        </button>
      )}

      {/* Thumbnail / fallback */}
      <div className="relative aspect-[4/3] bg-[var(--ink)]/60 border-b border-[var(--border)]">
        {showImage && doc.file_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={doc.file_url}
            alt={doc.title}
            className="absolute inset-0 h-full w-full object-contain bg-white/5"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--fg-muted)]">
            <IdCard className="h-12 w-12 text-emerald-300/70" />
            <span className="text-xs flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {typeLabel}
            </span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <div className="min-w-0">
          <span className="inline-flex rounded-lg border border-teal-400/30 bg-teal-400/10 px-2 py-0.5 text-[11px] text-teal-200">
            {typeLabel}
          </span>
          <h3 className="mt-2 font-bold text-[var(--fg)] leading-snug">
            {doc.title}
          </h3>
          {doc.summary && doc.summary !== doc.title && (
            <p className="mt-1 text-xs text-[var(--fg-muted)]">{doc.summary}</p>
          )}
        </div>

        <div className="space-y-1.5 text-sm flex-1">
          {doc.document_number && (
            <p>
              <span className="text-[var(--fg-muted)]">{he.vault.docNumber}: </span>
              <span className="font-[family-name:var(--font-mono)] font-semibold">
                {doc.document_number}
              </span>
            </p>
          )}
          <p
            className={cn(
              "inline-flex items-center gap-1.5",
              doc.expired || doc.expiring_soon
                ? "text-red-300 font-semibold"
                : "text-[var(--fg-muted)]"
            )}
          >
            {(doc.expired || doc.expiring_soon) && (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {he.vault.expires}: {formatExpiry(doc)}
            {doc.expired && ` · ${he.vault.expired}`}
            {!doc.expired && doc.expiring_soon && ` · ${he.vault.expiringSoon}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {href ? (
            <button
              type="button"
              className={linkBtn}
              onClick={() => onView?.(doc)}
            >
              {he.vault.viewDoc}
              <Eye className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className={cn(linkBtn, "opacity-40 cursor-not-allowed")}>
              {he.vault.viewDoc}
            </span>
          )}
          {dlHref ? (
            <a
              href={dlHref}
              download={
                doc.file_url?.startsWith("data:")
                  ? downloadFileName(doc)
                  : undefined
              }
              target={doc.file_url?.startsWith("data:") ? undefined : "_blank"}
              rel="noopener noreferrer"
              className={linkBtn}
            >
              {he.vault.downloadDoc}
              <Download className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span className={cn(linkBtn, "opacity-40 cursor-not-allowed")}>
              {he.vault.downloadDoc}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
