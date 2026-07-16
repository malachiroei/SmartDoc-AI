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
import { useToast } from "@/components/ui/Toast";
import {
  createDriveFolder,
  makeScanFileBase,
  uploadPagesToDrive,
  upsertRoutingRule,
} from "@/lib/drive/actions";
import { fetchJsonOk } from "@/lib/api/client-fetch";
import { createBillFromClassification } from "@/lib/bills/client";
import { createVaultFromClassification } from "@/lib/vault/client";
import { submitClassificationFeedback } from "@/lib/ai/feedback-client";
import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
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
        const fileNameHint = pages
          .map((p) => p.sourceFileName)
          .filter(Boolean)
          .join(" ");
        const forcePersonal = pages.some((p) => p.forcePersonalDoc);
        const classifyData = await fetchJsonOk<ClassificationResult & { error?: string }>(
          "/api/ai/classify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64,
              fileName: fileNameHint || undefined,
              hint: forcePersonal
                ? "תעודה אישית רישיון דרכון זהות"
                : fileNameHint || undefined,
              forcePersonal,
            }),
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
          is_unpaid_bill: classifyData.is_unpaid_bill,
          amount: classifyData.amount,
          due_date: classifyData.due_date,
          is_personal_doc: classifyData.is_personal_doc,
          document_number: classifyData.document_number,
          expiration_date: classifyData.expiration_date,
          tags: classifyData.tags,
        };
        setClassification(result);

        // Personal vault — auto-file to מסמכים אישיים
        if (result.is_personal_doc) {
          setBusy(true);
          try {
            const folder = await createDriveFolder(PERSONAL_VAULT_FOLDER_HE);
            const uploaded = await uploadPagesToDrive({
              pages,
              format,
              folderId: folder.id,
              fileBase: makeScanFileBase(),
            });
            if (cancelled) return;
            const saved = await createVaultFromClassification(result, uploaded);
            toast(
              he.vault.vaultSaved(
                saved?.title || result.summary || docTypeHe(result.doc_type)
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
          } catch (vaultErr) {
            console.warn("[vault auto-file]", vaultErr);
            setBusy(false);
            // Fall through to normal routing on failure
          }
        }

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

        // Autonomous branch — never for personal vault docs
        if (found?.is_autonomous && !result.is_personal_doc) {
          setBusy(true);
          const uploaded = await uploadPagesToDrive({
            pages,
            format,
            folderId: found.target_folder_id,
            fileBase: makeScanFileBase(),
          });
          if (cancelled) return;
          await maybeBillAlert(result, uploaded);
          await maybeVaultSave(result, uploaded);
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

  const maybeBillAlert = async (
    cls: ClassificationResult,
    driveFile: { id: string; webViewLink?: string }
  ) => {
    if (!cls.is_unpaid_bill) return;
    try {
      const bill = await createBillFromClassification(cls, driveFile);
      if (bill) {
        toast(
          he.bills.billCreated(cls.vendor, cls.amount ?? null),
          "success"
        );
      }
    } catch (e) {
      console.warn("[bill alert]", e);
    }
  };

  const maybeVaultSave = async (
    cls: ClassificationResult,
    driveFile: { id: string; webViewLink?: string }
  ) => {
    if (!cls.is_personal_doc) return;
    try {
      const doc = await createVaultFromClassification(cls, driveFile);
      if (doc) {
        toast(he.vault.vaultSaved(doc.title), "success");
      }
    } catch (e) {
      console.warn("[vault save]", e);
    }
  };

  const applyCorrection = async (
    original: ClassificationResult,
    corrected: ClassificationResult,
    folderName?: string
  ) => {
    setClassification(corrected);
    try {
      const res = await submitClassificationFeedback({
        original,
        corrected: {
          doc_type: corrected.doc_type,
          vendor: corrected.vendor,
          folder: folderName ?? corrected.suggested_folder_name,
          summary: corrected.summary,
          is_personal_doc: corrected.is_personal_doc,
        },
      });
      if (res.ok && !res.skipped) {
        toast(he.feedback.saved, "success");
      }
    } catch (e) {
      console.warn("[feedback]", e);
    }
  };

  const afterSuccessfulFile = async (
    folder: { id: string; name: string },
    cls?: ClassificationResult | null
  ): Promise<boolean> => {
    const active = cls ?? classification;
    if (!active) return true;
    try {
      const upsert = await upsertRoutingRule({
        vendor_or_doc_type: active.vendor,
        target_folder_id: folder.id,
        target_folder_name: folder.name,
      });

      if (upsert.learned || upsert.confirmation_count >= 3) {
        toast(
          he.toasts.learned(active.vendor, docTypeHe(active.doc_type)),
          "celebrate"
        );
      } else {
        toast(
          he.toasts.successCount(
            docTypeHe(active.doc_type),
            active.vendor,
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

  const handleFileExisting = async (corrected: ClassificationResult) => {
    if (!rule || !classification) return;
    setBusy(true);
    try {
      await applyCorrection(classification, corrected, rule.target_folder_name);
      const uploaded = await uploadPagesToDrive({
        pages,
        format,
        folderId: rule.target_folder_id,
        fileBase: makeScanFileBase(),
      });
      await maybeBillAlert(corrected, uploaded);
      await maybeVaultSave(corrected, uploaded);
      await afterSuccessfulFile(
        {
          id: rule.target_folder_id,
          name: rule.target_folder_name,
        },
        corrected
      );
      finish();
    } catch (e) {
      toast(e instanceof Error ? e.message : he.toasts.filingFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNew = async (corrected: ClassificationResult) => {
    if (!classification) return;
    setBusy(true);
    try {
      await applyCorrection(
        classification,
        corrected,
        corrected.suggested_folder_name
      );
      const folder = await createDriveFolder(corrected.suggested_folder_name);
      const uploaded = await uploadPagesToDrive({
        pages,
        format,
        folderId: folder.id,
        fileBase: makeScanFileBase(),
      });
      await maybeBillAlert(corrected, uploaded);
      await maybeVaultSave(corrected, uploaded);
      await afterSuccessfulFile(
        { id: folder.id, name: folder.name },
        corrected
      );
      finish();
    } catch (e) {
      toast(e instanceof Error ? e.message : he.toasts.filingFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleManual = async (corrected: ClassificationResult) => {
    if (classification) {
      await applyCorrection(classification, corrected);
    }
    setPhase("actions");
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
          key={`${classification.doc_type}-${classification.vendor}`}
          open
          classification={classification}
          rule={rule}
          busy={busy}
          onFileExisting={handleFileExisting}
          onCreateNew={handleCreateNew}
          onManual={handleManual}
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
          onDriveFiled={async ({ folder, file }) => {
            if (classification) {
              try {
                await maybeBillAlert(classification, file);
                await maybeVaultSave(classification, file);
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
