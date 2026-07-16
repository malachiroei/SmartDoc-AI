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
import { ClassificationBadge } from "./ClassificationBadge";
import { cn } from "@/lib/utils";
import { he } from "@/lib/i18n/he";

type ActionTab = "drive" | "email" | null;

type Props = {
  open: boolean;
  pages: ScannedPage[];
  format: ExportFormat;
  onClose: () => void;
  onDone?: () => void;
  classificationHint?: ClassificationResult | null;
  onDriveFiled?: (opts: {
    folder: DriveFolder;
    file: { id: string; webViewLink?: string };
  }) => void | Promise<void>;
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
      setStatus(he.actions.downloaded(filename));
      setDone(true);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : he.actions.exportFailed);
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
      if (!res.ok) throw new Error(data.error ?? he.actions.uploadFailed);
      await onDriveFiled?.({
        folder,
        file: { id: data.id, webViewLink: data.webViewLink },
      });
      setStatus(he.actions.savedTo(folder.name, data.name ?? filename));
      setDone(true);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : he.actions.uploadFailed);
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
      if (!res.ok) throw new Error(data.error ?? he.actions.sendFailed);
      setStatus(he.actions.emailSent(payload.to));
      setDone(true);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : he.actions.sendFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={he.actions.scanReady}
      subtitle={he.actions.pagesLabel(pages.length, format)}
      wide
    >
      {done ? (
        <div className="py-8 flex flex-col items-center text-center gap-3 animate-fade-in" dir="rtl">
          <CheckCircle2 className="h-12 w-12 text-teal-400" />
          <p className="text-[var(--fg)] font-medium">{status}</p>
          <div className="flex gap-2 mt-2">
            <Button variant="secondary" onClick={() => reset()}>
              {he.actions.anotherAction}
            </Button>
            <Button
              onClick={() => {
                handleClose();
                onDone?.();
              }}
            >
              {he.actions.done}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5" dir="rtl">
          {classificationHint && (
            <ClassificationBadge classification={classificationHint} />
          )}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {pages.slice(0, 4).map((p, i) => (
              <img
                key={p.id}
                src={p.processedDataUrl}
                alt={`${he.scanner.page} ${i + 1}`}
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
                  "rounded-2xl border border-[var(--border)] p-5 text-start",
                  "bg-[var(--surface-2)] hover:border-teal-400/60 transition-colors"
                )}
              >
                <HardDrive className="h-6 w-6 text-teal-300 mb-3" />
                <div className="font-[family-name:var(--font-display)] text-lg">
                  {he.actions.saveDrive}
                </div>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  {he.actions.saveDriveHint}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("email")}
                className={cn(
                  "rounded-2xl border border-[var(--border)] p-5 text-start",
                  "bg-[var(--surface-2)] hover:border-teal-400/60 transition-colors"
                )}
              >
                <Mail className="h-6 w-6 text-teal-300 mb-3" />
                <div className="font-[family-name:var(--font-display)] text-lg">
                  {he.actions.sendEmail}
                </div>
                <p className="mt-1 text-sm text-[var(--fg-muted)]">
                  {he.actions.sendEmailHint}
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
                {he.actions.back} →
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
                {he.actions.back} →
              </button>
              <EmailComposer
                defaultSubject={he.email.defaultSubject(fileBase)}
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
              <Download className="h-4 w-4" /> {he.actions.downloadLocal}
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
