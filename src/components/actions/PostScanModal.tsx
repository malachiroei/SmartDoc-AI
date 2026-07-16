"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Download, HardDrive, Mail } from "lucide-react";
import type {
  ClassificationResult,
  DriveFolder,
  ExportFormat,
  ScannedPage,
} from "@/lib/types";
import { downloadBlob, exportPages } from "@/lib/image/export";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  DriveFolderPicker,
  DriveUploadBar,
} from "./DriveFolderPicker";
import { EmailComposer } from "./EmailComposer";
import { cn } from "@/lib/utils";

type ActionTab = "drive" | "email" | null;

type Props = {
  open: boolean;
  pages: ScannedPage[];
  format: ExportFormat;
  onClose: () => void;
  onDone?: () => void;
  /** Optional AI classification context from Phase 2 routing */
  classificationHint?: ClassificationResult | null;
  /** Called after a successful Drive upload (for 3-Strike learning) */
  onDriveFiled?: (folder: DriveFolder) => void | Promise<void>;
};

export function PostScanModal({
  open,
  pages,
  format,
  onClose,
  onDone,
  classificationHint,
  onDriveFiled,
}: Props) {
  const [tab, setTab] = useState<ActionTab>(null);
  const [folder, setFolder] = useState<DriveFolder | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const fileBase = useMemo(() => {
    const d = new Date();
    const stamp = d.toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return `SmartDoc-${stamp}`;
  }, [open]);

  const fileName = `${fileBase}.${format}`;

  const reset = () => {
    setTab(null);
    setStatus(null);
    setBusy(false);
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleLocalDownload = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await exportPages(pages, format, fileBase);
      downloadBlob(blob, filename);
      setStatus(`Downloaded ${filename}`);
      setDone(true);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDriveUpload = async () => {
    if (!folder) return;
    setBusy(true);
    setStatus(null);
    try {
      const { blob, filename, mimeType } = await exportPages(
        pages,
        format,
        fileBase
      );
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("folderId", folder.id);
      form.append("fileName", filename);
      form.append("mimeType", mimeType);

      const res = await fetch("/api/drive/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await onDriveFiled?.(folder);
      setStatus(`Saved to ${folder.name}: ${data.name ?? filename}`);
      setDone(true);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSend = async (payload: {
    to: string;
    subject: string;
    body: string;
  }) => {
    setBusy(true);
    setStatus(null);
    try {
      const { blob, filename, mimeType } = await exportPages(
        pages,
        format,
        fileBase
      );
      const form = new FormData();
      form.append("file", blob, filename);
      form.append("to", payload.to);
      form.append("subject", payload.subject);
      form.append("body", payload.body);
      form.append("mimeType", mimeType);

      const res = await fetch("/api/email/send", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setStatus(`Email sent to ${payload.to}`);
      setDone(true);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Scan ready"
      subtitle={`${pages.length} page${pages.length === 1 ? "" : "s"} · ${format.toUpperCase()}`}
      wide
    >
      {done ? (
        <div className="py-8 flex flex-col items-center text-center gap-3 animate-fade-in">
          <CheckCircle2 className="h-12 w-12 text-teal-400" />
          <p className="text-[var(--fg)] font-medium">{status}</p>
          <div className="flex gap-2 mt-2">
            <Button
              variant="secondary"
              onClick={() => {
                reset();
              }}
            >
              Another action
            </Button>
            <Button
              onClick={() => {
                handleClose();
                onDone?.();
              }}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {classificationHint && (
            <p className="text-xs text-[var(--fg-muted)] rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
              AI:{" "}
              <span className="text-teal-200">
                {classificationHint.vendor} · {classificationHint.doc_type}
              </span>{" "}
              — {classificationHint.summary}
            </p>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {pages.slice(0, 4).map((p, i) => (
              <img
                key={p.id}
                src={p.processedDataUrl}
                alt={`Page ${i + 1}`}
                className="h-20 w-14 rounded-lg object-cover border border-[var(--border)] bg-white"
              />
            ))}
            {pages.length > 4 && (
              <div className="h-20 w-14 rounded-lg border border-dashed border-[var(--border)] flex items-center justify-center text-xs text-[var(--fg-muted)]">
                +{pages.length - 4}
              </div>
            )}
          </div>

          {!tab && (
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTab("drive")}
                className={cn(
                  "rounded-2xl border border-[var(--border)] p-5 text-left",
                  "bg-[var(--surface-2)] hover:border-teal-400/60 transition-colors group"
                )}
              >
                <HardDrive className="h-6 w-6 text-teal-300 mb-3" />
                <div className="font-[family-name:var(--font-display)] text-lg">
                  Save to Google Drive
                </div>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  Pick a folder — defaults to root or last used.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("email")}
                className={cn(
                  "rounded-2xl border border-[var(--border)] p-5 text-left",
                  "bg-[var(--surface-2)] hover:border-teal-400/60 transition-colors"
                )}
              >
                <Mail className="h-6 w-6 text-teal-300 mb-3" />
                <div className="font-[family-name:var(--font-display)] text-lg">
                  Send via Email
                </div>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  Recipient autocomplete from recent contacts.
                </p>
              </button>
            </div>
          )}

          {tab === "drive" && (
            <div className="space-y-4 animate-fade-in">
              <button
                type="button"
                className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
                onClick={() => setTab(null)}
              >
                ← Back
              </button>
              <DriveFolderPicker
                selectedId={folder?.id}
                onSelect={setFolder}
              />
              <DriveUploadBar
                folder={folder}
                fileName={fileName}
                uploading={busy}
                onUpload={handleDriveUpload}
              />
            </div>
          )}

          {tab === "email" && (
            <div className="space-y-4 animate-fade-in">
              <button
                type="button"
                className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
                onClick={() => setTab(null)}
              >
                ← Back
              </button>
              <EmailComposer
                defaultSubject={`Scanned document — ${fileBase}`}
                sending={busy}
                onSend={handleEmailSend}
              />
            </div>
          )}

          <div className="pt-2 border-t border-[var(--border)]">
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleLocalDownload}
              disabled={busy}
            >
              <Download className="h-4 w-4" /> Download locally
            </Button>
            {status && !done && (
              <p className="mt-2 text-center text-sm text-red-300">{status}</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
