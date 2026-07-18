"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  FolderOpen,
  Loader2,
  Trash2,
  FileText,
} from "lucide-react";
import type { ClassificationResult } from "@/lib/types";
import { fetchJsonOk } from "@/lib/api/client-fetch";
import { createDriveFolder } from "@/lib/drive/actions";
import { docTypeHe, he } from "@/lib/i18n/he";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type PendingItem = {
  id: string;
  original_file_name: string;
  mime_type: string;
  drive_file_url: string | null;
  classification: ClassificationResult;
  suggested_file_name: string;
  suggested_folder_name: string;
  vendor_key: string;
  confirmation_count: number;
  created_at: string;
};

type Props = {
  refreshKey?: number;
  onChanged?: () => void;
};

export function PendingFilingsPanel({ refreshKey = 0, onChanged }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { fileName: string; folderName: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJsonOk<{ pending: PendingItem[] }>(
        "/api/gmail/pending",
        { networkError: he.gmail.pendingLoadError }
      );
      setItems(data.pending ?? []);
      const next: Record<string, { fileName: string; folderName: string }> = {};
      for (const p of data.pending ?? []) {
        next[p.id] = {
          fileName: p.suggested_file_name.replace(/\.(pdf|png|jpe?g)$/i, ""),
          folderName: p.suggested_folder_name,
        };
      }
      setDrafts(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : he.gmail.pendingLoadError);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const confirm = async (item: PendingItem) => {
    const draft = drafts[item.id];
    if (!draft?.fileName.trim() || !draft.folderName.trim()) {
      toast(he.gmail.pendingNeedFields);
      return;
    }
    setBusyId(item.id);
    try {
      const folder = await createDriveFolder(draft.folderName.trim());
      const res = await fetchJsonOk<{
        learned: boolean;
        confirmation_count: number;
      }>("/api/gmail/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          id: item.id,
          fileName: draft.fileName.trim(),
          folderId: folder.id,
          folderName: folder.name,
          classification: item.classification,
        }),
        networkError: he.gmail.pendingConfirmError,
      });

      if (res.learned || res.confirmation_count >= 3) {
        toast(
          he.toasts.learned(
            item.vendor_key,
            docTypeHe(item.classification.doc_type)
          ),
          "celebrate"
        );
      } else {
        toast(
          he.toasts.successCount(
            docTypeHe(item.classification.doc_type),
            item.vendor_key,
            res.confirmation_count
          ),
          "success"
        );
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : he.gmail.pendingConfirmError);
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (item: PendingItem) => {
    if (!window.confirm(he.gmail.pendingDismissConfirm)) return;
    setBusyId(item.id);
    try {
      await fetchJsonOk("/api/gmail/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", id: item.id }),
        networkError: he.gmail.pendingDismissError,
      });
      toast(he.gmail.pendingDismissed, "success");
      await load();
      onChanged?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : he.gmail.pendingDismissError);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {he.gmail.pendingLoading}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--fg-muted)] rounded-xl border border-[var(--border)] px-3 py-3">
        {he.gmail.pendingEmpty}
      </p>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-lg">
          {he.gmail.pendingTitle}
        </h3>
        <p className="text-sm text-[var(--fg-muted)]">{he.gmail.pendingSubtitle}</p>
      </div>

      {items.map((item) => {
        const draft = drafts[item.id] ?? {
          fileName: item.suggested_file_name,
          folderName: item.suggested_folder_name,
        };
        const busy = busyId === item.id;
        const count = item.confirmation_count;

        return (
          <div
            key={item.id}
            className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-amber-200 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">
                  {docTypeHe(item.classification.doc_type)} ·{" "}
                  <span className="text-teal-200">{item.vendor_key}</span>
                </p>
                <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                  {item.classification.summary}
                </p>
                <p className="text-[11px] text-amber-100/80 mt-1">
                  {he.routing.memory(count)}
                </p>
              </div>
            </div>

            <label className="block text-xs space-y-1">
              <span className="text-[var(--fg-muted)]">{he.gmail.pendingFileName}</span>
              <input
                type="text"
                value={draft.fileName}
                disabled={busy}
                onChange={(e) =>
                  setDrafts((d) => ({
                    ...d,
                    [item.id]: { ...draft, fileName: e.target.value },
                  }))
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--ink)]/70 px-3 py-2.5 text-sm outline-none focus:border-teal-400/50"
              />
            </label>

            <label className="block text-xs space-y-1">
              <span className="text-[var(--fg-muted)]">{he.gmail.pendingFolder}</span>
              <div className="relative">
                <FolderOpen className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fg-muted)]" />
                <input
                  type="text"
                  value={draft.folderName}
                  disabled={busy}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [item.id]: { ...draft, folderName: e.target.value },
                    }))
                  }
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--ink)]/70 px-3 py-2.5 pe-10 text-sm outline-none focus:border-teal-400/50"
                />
              </div>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void confirm(item)}
                className={cn(busy && "opacity-70")}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {he.gmail.pendingConfirm}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void dismiss(item)}
              >
                <Trash2 className="h-4 w-4" />
                {he.gmail.pendingDismiss}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
