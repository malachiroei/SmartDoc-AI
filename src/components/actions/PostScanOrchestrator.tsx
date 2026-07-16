"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Brain } from "lucide-react";
import type {
  ClassificationResult,
  ExportFormat,
  RoutingRule,
  ScannedPage,
} from "@/lib/types";
import { PostScanModal } from "./PostScanModal";
import { SmartRoutingDialog } from "./SmartRoutingDialog";
import { ClassificationBadge } from "./ClassificationBadge";
import { useToast } from "@/components/ui/Toast";
import {
  createDriveFolder,
  makeScanFileBase,
  uploadPagesToDrive,
  upsertRoutingRule,
} from "@/lib/drive/actions";
import { fetchJsonOk } from "@/lib/api/client-fetch";
import { docTypeHe, he } from "@/lib/i18n/he";

type Phase = "idle" | "classifying" | "routing" | "actions";

type Props = {
  open: boolean;
  pages: ScannedPage[];
  format: ExportFormat;
  onClose: () => void;
  onDone?: () => void;
};

export function PostScanOrchestrator({
  open,
  pages,
  format,
  onClose,
  onDone,
}: Props) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [classification, setClassification] =
    useState<ClassificationResult | null>(null);
  const [rule, setRule] = useState<RoutingRule | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = useCallback(() => {
    setPhase("idle");
    setClassification(null);
    setRule(null);
    setBusy(false);
    onDone?.();
    onClose();
  }, [onClose, onDone]);

  const handleClose = () => {
    setPhase("idle");
    setClassification(null);
    setRule(null);
    setBusy(false);
    onClose();
  };

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setClassification(null);
      setRule(null);
      setBusy(false);
      return;
    }

    let cancelled = false;

    (async () => {
      if (pages.length === 0) return;
      setPhase("classifying");

      try {
        const imageBase64 = pages[0].processedDataUrl;
        const classifyData = await fetchJsonOk<ClassificationResult & { error?: string }>(
          "/api/ai/classify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64 }),
            networkError: he.classify.failed,
          }
        );
        if (cancelled) return;

        const result: ClassificationResult = {
          doc_type: classifyData.doc_type,
          vendor: classifyData.vendor,
          suggested_folder_name: classifyData.suggested_folder_name,
          summary: classifyData.summary,
          confidence: classifyData.confidence,
        };
        setClassification(result);

        // Memory lookup — failures must NOT skip the Smart Routing dialog
        let found: RoutingRule | null = null;
        try {
          const lookupData = await fetchJsonOk<{ rule: RoutingRule | null }>(
            `/api/rules/lookup?vendor=${encodeURIComponent(result.vendor)}`,
            { networkError: he.classify.lookupFailed }
          );
          found = lookupData.rule ?? null;
        } catch (lookupErr) {
          console.warn("[rules/lookup]", lookupErr);
        }
        if (cancelled) return;
        setRule(found);

        // Autonomous branch — file silently
        if (found?.is_autonomous) {
          setBusy(true);
          await uploadPagesToDrive({
            pages,
            format,
            folderId: found.target_folder_id,
            fileBase: makeScanFileBase(),
          });
          if (cancelled) return;
          const typeLabel = docTypeHe(result.doc_type);
          toast(
            he.toasts.autoFiled(
              typeLabel,
              result.vendor,
              found.target_folder_name
            ),
            "auto"
          );
          setBusy(false);
          setPhase("idle");
          setClassification(null);
          setRule(null);
          onDone?.();
          onClose();
          return;
        }

        // Primary interactive modal — always after successful classify
        setPhase("routing");
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        toast(
          e instanceof Error ? e.message : he.classify.failed,
          "default"
        );
        // Classify failed — still allow manual Drive/Email actions
        setPhase("actions");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const afterSuccessfulFile = async (folder: {
    id: string;
    name: string;
  }): Promise<boolean> => {
    if (!classification) return true;
    try {
      const upsert = await upsertRoutingRule({
        vendor_or_doc_type: classification.vendor,
        target_folder_id: folder.id,
        target_folder_name: folder.name,
      });

      if (upsert.learned || upsert.confirmation_count >= 3) {
        toast(
          he.toasts.learned(
            classification.vendor,
            docTypeHe(classification.doc_type)
          ),
          "celebrate"
        );
      } else {
        toast(
          he.toasts.successCount(
            docTypeHe(classification.doc_type),
            classification.vendor,
            upsert.confirmation_count
          ),
          "success"
        );
      }
      return true;
    } catch (e) {
      toast(
        e instanceof Error ? e.message : he.toasts.ruleSaveFailed,
        "default"
      );
      return false;
    }
  };

  const handleFileExisting = async () => {
    if (!rule || !classification) return;
    setBusy(true);
    try {
      await uploadPagesToDrive({
        pages,
        format,
        folderId: rule.target_folder_id,
        fileBase: makeScanFileBase(),
      });
      await afterSuccessfulFile({
        id: rule.target_folder_id,
        name: rule.target_folder_name,
      });
      finish();
    } catch (e) {
      toast(e instanceof Error ? e.message : he.toasts.filingFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNew = async () => {
    if (!classification) return;
    setBusy(true);
    try {
      const folder = await createDriveFolder(
        classification.suggested_folder_name
      );
      await uploadPagesToDrive({
        pages,
        format,
        folderId: folder.id,
        fileBase: makeScanFileBase(),
      });
      await afterSuccessfulFile({ id: folder.id, name: folder.name });
      finish();
    } catch (e) {
      toast(e instanceof Error ? e.message : he.toasts.filingFailed);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {phase === "classifying" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" dir="rtl">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-2xl animate-slide-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-300">
              <Brain className="h-7 w-7" />
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              {he.classify.analyzing}
            </h2>
            <p className="mt-2 text-sm text-[var(--fg-muted)]">
              {he.classify.analyzingSub}
            </p>
            <Loader2 className="mx-auto mt-5 h-6 w-6 animate-spin text-teal-300" />
          </div>
        </div>
      )}

      {phase === "routing" && classification && (
        <SmartRoutingDialog
          open
          classification={classification}
          rule={rule}
          busy={busy}
          onFileExisting={handleFileExisting}
          onCreateNew={handleCreateNew}
          onManual={() => setPhase("actions")}
          onClose={handleClose}
        />
      )}

      {phase === "actions" && (
        <PostScanModal
          open
          pages={pages}
          format={format}
          onClose={handleClose}
          onDone={finish}
          classificationHint={classification}
          onDriveFiled={async (folder) => {
            if (classification) {
              try {
                await afterSuccessfulFile(folder);
              } catch {
                /* non-blocking */
              }
            }
          }}
        />
      )}
    </>
  );
}
