"use client";

import { useState } from "react";
import { Inbox, Loader2, Mail } from "lucide-react";
import { ingestGmail } from "@/lib/bills/client";
import { he } from "@/lib/i18n/he";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type ProcessedItem = {
  fileName: string;
  vendor: string;
  doc_type: string;
  folder?: string;
  billAlert?: boolean;
};

type Props = {
  onIngested?: () => void;
};

export function GmailIngestPanel({ onIngested }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{
    scanned: number;
    processed: ProcessedItem[];
    demo: boolean;
  } | null>(null);

  const runIngest = async () => {
    setBusy(true);
    try {
      const result = await ingestGmail();
      setLastResult({
        scanned: result.scanned,
        processed: result.processed as ProcessedItem[],
        demo: result.demo,
      });

      if (result.notifications.length > 0) {
        for (const n of result.notifications) {
          toast(n, "auto");
        }
      } else if (result.processed.length === 0) {
        toast(he.gmail.noNew);
      } else {
        toast(he.gmail.lastScan(result.scanned), "success");
      }

      onIngested?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : he.gmail.ingestError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            {he.gmail.title}
          </h2>
          <p className="text-sm text-[var(--fg-muted)]">{he.gmail.subtitle}</p>
        </div>
      </div>

      <Button size="lg" className="w-full sm:w-auto" onClick={() => void runIngest()} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> {he.gmail.ingesting}
          </>
        ) : (
          <>
            <Inbox className="h-5 w-5" /> {he.gmail.ingest}
          </>
        )}
      </Button>

      {lastResult?.demo && (
        <p className="text-xs text-[var(--fg-muted)] rounded-xl border border-[var(--border)] px-3 py-2">
          {he.gmail.demoNote}
        </p>
      )}

      {lastResult && lastResult.processed.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
          <p className="text-sm font-medium">{he.gmail.processed}</p>
          {lastResult.processed.map((p, i) => (
            <div
              key={i}
              className="text-sm text-[var(--fg-muted)] border-t border-[var(--border)] pt-2 first:border-0 first:pt-0"
            >
              <span className="font-semibold text-[var(--fg)]">{p.doc_type}</span>
              {" "}של{" "}
              <span className="font-semibold text-teal-200">{p.vendor}</span>
              {p.folder && ` → ${p.folder}`}
              {p.billAlert && " · חשבון פתוח"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
