"use client";

import { Download } from "lucide-react";
import type { RetrieveDocumentCard } from "@/lib/types";
import { he } from "@/lib/i18n/he";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Props = {
  document: RetrieveDocumentCard | null;
  open: boolean;
  onClose: () => void;
};

function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith("data:image/") ||
    /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url) ||
    url.includes("googleusercontent") ||
    url.includes("/uc?export=")
  );
}

function downloadFileName(doc: RetrieveDocumentCard): string {
  const base = (doc.title || "document").replace(/[\\/:*?"<>|]+/g, "_").trim();
  if (doc.file_url?.startsWith("data:image/png")) return `${base}.png`;
  if (doc.file_url?.startsWith("data:image/webp")) return `${base}.webp`;
  if (doc.file_url?.startsWith("data:image/")) return `${base}.jpg`;
  return `${base}.jpg`;
}

export function VaultPreviewModal({ document: doc, open, onClose }: Props) {
  if (!doc) return null;

  const url = doc.file_url;
  const showImage = isImageUrl(url);
  const driveEmbed =
    doc.file_id && !doc.file_id.startsWith("demo-")
      ? `https://drive.google.com/file/d/${doc.file_id}/preview`
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={doc.title || he.vault.previewTitle}
      subtitle={doc.summary && doc.summary !== doc.title ? doc.summary : undefined}
      wide
      className="sm:max-w-3xl"
    >
      <div className="space-y-4">
        <div className="relative min-h-[240px] max-h-[70vh] overflow-auto rounded-2xl border border-[var(--border)] bg-[var(--ink)]/70 flex items-center justify-center">
          {showImage && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={doc.title}
              className="max-h-[70vh] w-full object-contain p-2"
            />
          ) : driveEmbed ? (
            <iframe
              title={doc.title}
              src={driveEmbed}
              className="h-[60vh] w-full rounded-xl border-0"
              allow="autoplay"
            />
          ) : (
            <p className="px-6 py-16 text-center text-sm text-[var(--fg-muted)]">
              {he.vault.noPreview}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {url?.startsWith("data:") ? (
            <a
              href={url}
              download={downloadFileName(doc)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm hover:bg-[var(--surface-3)]"
            >
              <Download className="h-4 w-4" />
              {he.vault.downloadDoc}
            </a>
          ) : doc.file_id && !doc.file_id.startsWith("demo-") ? (
            <a
              href={`https://drive.google.com/uc?export=download&id=${doc.file_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm hover:bg-[var(--surface-3)]"
            >
              <Download className="h-4 w-4" />
              {he.vault.downloadDoc}
            </a>
          ) : (
            <span />
          )}

          <Button variant="secondary" onClick={onClose}>
            {he.vault.closePreview}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
