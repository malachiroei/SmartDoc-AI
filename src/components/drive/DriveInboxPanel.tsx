"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderSync, Loader2, RefreshCw } from "lucide-react";
import { ingestDriveInbox } from "@/lib/drive/client";
import { ApiRequestError } from "@/lib/api/client-fetch";
import { SMARTDOC_INBOX_FOLDER } from "@/lib/google/constants";
import { he } from "@/lib/i18n/he";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { PendingFilingsPanel } from "@/components/gmail/PendingFilingsPanel";

const AUTO_POLL_MS = 30_000;

type ProcessedItem = {
  fileName: string;
  vendor: string;
  doc_type: string;
  folder?: string;
  billAlert?: boolean;
  pending?: boolean;
  autonomous?: boolean;
};

export function DriveInboxPanel() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pendingKey, setPendingKey] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [lastResult, setLastResult] = useState<{
    scanned: number;
    processed: ProcessedItem[];
    demo: boolean;
  } | null>(null);
  const busyRef = useRef(false);

  const runIngest = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const result = await ingestDriveInbox();
        setLastResult({
          scanned: result.scanned,
          processed: result.processed as ProcessedItem[],
          demo: result.demo,
        });
        setLastSync(new Date());

        if (!opts?.silent) {
          if (result.notifications.length > 0) {
            for (const n of result.notifications) {
              toast(n, result.processed.some((p) => p.autonomous) ? "success" : "auto");
            }
          } else if (result.processed.length === 0) {
            toast(he.driveInbox.noNew);
          }
        } else if (result.processed.some((p) => p.pending || p.autonomous)) {
          for (const n of result.notifications.slice(0, 2)) {
            toast(n, "auto");
          }
        }

        setPendingKey((k) => k + 1);
      } catch (e) {
        if (opts?.silent) return;
        const msg =
          e instanceof ApiRequestError && (e.status === 504 || e.status === 408)
            ? he.driveInbox.ingestTimeout
            : e instanceof Error
              ? e.message
              : he.driveInbox.ingestError;
        toast(msg);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [toast]
  );

  // Initial pull + auto poll
  useEffect(() => {
    void runIngest({ silent: true });
    const id = window.setInterval(() => {
      void runIngest({ silent: true });
    }, AUTO_POLL_MS);
    return () => window.clearInterval(id);
  }, [runIngest]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300">
            <FolderSync className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              {he.driveInbox.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              {he.driveInbox.subtitle(SMARTDOC_INBOX_FOLDER)}
            </p>
            <p className="mt-2 text-xs text-[var(--fg-muted)]">
              {he.driveInbox.hint}
            </p>
            {lastSync && (
              <p className="mt-1 text-[11px] text-[var(--fg-muted)]">
                {he.driveInbox.lastSync(lastSync.toLocaleTimeString("he-IL"))}
              </p>
            )}
          </div>
        </div>

        <Button
          size="lg"
          className="w-full"
          onClick={() => void runIngest()}
          disabled={busy}
        >
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> {he.driveInbox.ingesting}
            </>
          ) : (
            <>
              <RefreshCw className="h-5 w-5" /> {he.driveInbox.refresh}
            </>
          )}
        </Button>

        {lastResult && lastResult.processed.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {lastResult.processed.map((p, i) => (
              <li
                key={`${p.fileName}-${i}`}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
              >
                <span className="font-medium">{p.doc_type}</span>
                {" · "}
                {p.vendor}
                {p.autonomous
                  ? ` → ${p.folder ?? ""}`
                  : ` · ${he.driveInbox.pendingBadge}`}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PendingFilingsPanel refreshKey={pendingKey} />
    </div>
  );
}
