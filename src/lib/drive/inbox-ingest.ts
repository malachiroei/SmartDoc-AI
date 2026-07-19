import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
import { maybeCreateBillAlert, PENDING_BILLS_FOLDER_HE } from "@/lib/bills/alerts";
import { maybeCreatePersonalDocument } from "@/lib/vault/documents";
import { docTypeHe } from "@/lib/i18n/he";
import type { ClassificationResult, RoutingRule } from "@/lib/types";
import { classifyBuffer } from "@/lib/ai/classify";
import { syntheticInvoiceResult } from "@/lib/ai/vision-prep";
import { getSupabase, mapSupabaseError } from "@/lib/supabase/client";
import { SMARTDOC_INBOX_FOLDER } from "@/lib/google/constants";
import {
  downloadDriveFileBuffer,
  ensureSmartDocInbox,
  listInboxFiles,
  moveAndRenameDriveFile,
} from "@/lib/drive/server";
import { makeScanFileName, sanitizeFileBase } from "@/lib/drive/filename";
import { getAuthenticatedDrive } from "@/lib/google/drive-client";
import {
  findPendingByDriveFileId,
  insertPendingFiling,
  markPendingFiling,
  type PendingFiling,
} from "@/lib/gmail/pending";

const MAX_FILES = 8;
const MAX_NEW_CLASSIFICATIONS = 3;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TIME_BUDGET_MS = 48_000;

type ProcessedFile = {
  fileId: string;
  fileName: string;
  vendor: string;
  doc_type: string;
  autonomous: boolean;
  pending?: boolean;
  pendingId?: string;
  folder?: string;
  billAlert?: boolean;
  demo?: boolean;
};

export type DriveInboxIngestResult = {
  processed: ProcessedFile[];
  notifications: string[];
  demo: boolean;
  scanned: number;
  pendingCount: number;
  inboxFolder: string;
  partial?: boolean;
  skippedRemaining?: number;
};

async function lookupRule(vendor: string): Promise<RoutingRule | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("routing_rules")
    .select("*")
    .eq("vendor_or_doc_type", vendor)
    .maybeSingle();

  if (error) throw new Error(mapSupabaseError(error));
  return (data as RoutingRule) ?? null;
}

function extFromMime(mimeType: string, fileName: string): "pdf" | "png" | "jpg" {
  if (mimeType.includes("pdf") || /\.pdf$/i.test(fileName)) return "pdf";
  if (mimeType.includes("png") || /\.png$/i.test(fileName)) return "png";
  return "jpg";
}

function suggestedFolderFor(result: ClassificationResult): string {
  if (result.is_personal_doc) return PERSONAL_VAULT_FOLDER_HE;
  if (result.suggested_folder_name?.trim()) {
    return result.suggested_folder_name.trim();
  }
  if (result.is_unpaid_bill) return PENDING_BILLS_FOLDER_HE;
  return "מסמכים";
}

async function demoInboxIngest(): Promise<DriveInboxIngestResult> {
  const result = syntheticInvoiceResult();
  const smartName = makeScanFileName(result, "pdf");
  const demoId = `demo-drive-${Date.now()}`;

  const pending = await insertPendingFiling({
    source: "drive-inbox-demo",
    gmail_message_id: null,
    original_file_name: "demo-scan.pdf",
    mime_type: "application/pdf",
    drive_file_id: demoId,
    drive_file_url: `https://drive.google.com/file/d/${demoId}/view`,
    classification: result,
    suggested_file_name: smartName,
    suggested_folder_name: suggestedFolderFor(result),
    vendor_key: result.vendor,
    confirmation_count: 0,
  });

  return {
    demo: true,
    scanned: 1,
    pendingCount: 1,
    inboxFolder: SMARTDOC_INBOX_FOLDER,
    processed: [
      {
        fileId: demoId,
        fileName: smartName,
        vendor: result.vendor,
        doc_type: docTypeHe(result.doc_type),
        autonomous: false,
        pending: true,
        pendingId: pending.id,
        folder: SMARTDOC_INBOX_FOLDER,
        demo: true,
      },
    ],
    notifications: [
      `מצב דמו: נוסף מסמך מ-${SMARTDOC_INBOX_FOLDER} לאישור (1/3)`,
    ],
  };
}

/**
 * Pull new PDF/images from Google Drive SmartDoc_Inbox.
 * - Leaves files in Inbox until user approves (then confirmPendingFiling moves them)
 * - Autonomous rules: move+rename out of Inbox immediately
 */
export async function ingestDriveInbox(): Promise<DriveInboxIngestResult> {
  const auth = await getAuthenticatedDrive();
  if (!auth) {
    return demoInboxIngest();
  }

  await ensureSmartDocInbox(auth.drive);
  const { files } = await listInboxFiles();
  const started = Date.now();
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - started);

  const processed: ProcessedFile[] = [];
  const notifications: string[] = [];
  let pendingCount = 0;
  let newClassifications = 0;
  let skippedRemaining = 0;
  let partial = false;

  const batch = files.slice(0, MAX_FILES);

  for (const file of batch) {
    if (timeLeft() < 8_000) {
      partial = true;
      skippedRemaining += 1;
      continue;
    }

    const dup = await findPendingByDriveFileId(file.id);
    if (dup) {
      if (dup.status === "filed") continue;
      processed.push({
        fileId: file.id,
        fileName: dup.suggested_file_name,
        vendor: dup.vendor_key,
        doc_type: docTypeHe(dup.classification.doc_type),
        autonomous: false,
        pending: true,
        pendingId: dup.id,
        folder: SMARTDOC_INBOX_FOLDER,
      });
      pendingCount++;
      continue;
    }

    if (newClassifications >= MAX_NEW_CLASSIFICATIONS) {
      partial = true;
      skippedRemaining += 1;
      continue;
    }

    if (file.size && file.size > MAX_FILE_BYTES) {
      notifications.push(
        `דולג: ${file.name} גדול מדי (${Math.round((file.size ?? 0) / 1024 / 1024)}MB)`
      );
      continue;
    }

    newClassifications++;
    let buffer: Buffer;
    let mimeType = file.mimeType;
    try {
      const downloaded = await downloadDriveFileBuffer(file.id);
      buffer = downloaded.buffer;
      mimeType = downloaded.mimeType || mimeType;
    } catch (dlErr) {
      console.warn("[drive/inbox] download failed:", dlErr);
      notifications.push(`הורדה נכשלה: ${file.name}`);
      continue;
    }

    if (buffer.length > MAX_FILE_BYTES) {
      notifications.push(`דולג: ${file.name} גדול מדי אחרי הורדה`);
      continue;
    }

    let result: ClassificationResult;
    try {
      const classified = await classifyBuffer(buffer, mimeType, {
        fileName: file.name,
        hint: `Drive Inbox · ${SMARTDOC_INBOX_FOLDER}`,
      });
      result = classified.result;
    } catch (classifyErr) {
      console.warn("[drive/inbox] classify failed:", classifyErr);
      notifications.push(
        `סיווג נכשל עבור ${file.name}: ${
          classifyErr instanceof Error
            ? classifyErr.message.slice(0, 120)
            : "שגיאה"
        }`
      );
      continue;
    }

    const rule = await lookupRule(result.vendor);
    const ext = extFromMime(mimeType, file.name);
    const smartName = makeScanFileName(result, ext);
    const typeLabel = docTypeHe(result.doc_type);

    if (rule?.is_autonomous) {
      const safeBase = sanitizeFileBase(
        smartName.replace(/\.(pdf|png|jpe?g)$/i, "")
      );
      const moved = await moveAndRenameDriveFile({
        fileId: file.id,
        newName: `${safeBase}.${ext}`,
        newParentId: rule.target_folder_id,
      });

      // Record as filed so we never re-pull this file id
      const filedRow = await insertPendingFiling({
        source: "drive-inbox",
        gmail_message_id: null,
        original_file_name: file.name,
        mime_type: mimeType,
        drive_file_id: moved.id,
        drive_file_url: moved.webViewLink ?? null,
        classification: result,
        suggested_file_name: smartName,
        suggested_folder_name: rule.target_folder_name,
        vendor_key: result.vendor,
        confirmation_count: rule.confirmation_count ?? 3,
      });
      await markPendingFiling(filedRow.id, "filed");

      let billAlert = false;
      if (result.is_unpaid_bill) {
        billAlert = !!(await maybeCreateBillAlert(result, moved));
      }
      if (result.is_personal_doc) {
        await maybeCreatePersonalDocument(result, moved);
      }

      processed.push({
        fileId: moved.id,
        fileName: smartName,
        vendor: result.vendor,
        doc_type: typeLabel,
        autonomous: true,
        folder: rule.target_folder_name,
        billAlert,
      });
      notifications.push(
        `🤖 ${typeLabel} מ-${result.vendor} תויק אוטומטית ל-${rule.target_folder_name}`
      );
      continue;
    }

    // Keep file in SmartDoc_Inbox until user approves — then confirmPendingFiling moves it
    const pending = await insertPendingFiling({
      source: "drive-inbox",
      gmail_message_id: null,
      original_file_name: file.name,
      mime_type: mimeType,
      drive_file_id: file.id,
      drive_file_url: file.webViewLink ?? null,
      classification: result,
      suggested_file_name: smartName,
      suggested_folder_name: suggestedFolderFor(result),
      vendor_key: result.vendor,
      confirmation_count: rule?.confirmation_count ?? 0,
    });

    processed.push({
      fileId: file.id,
      fileName: smartName,
      vendor: result.vendor,
      doc_type: typeLabel,
      autonomous: false,
      pending: true,
      pendingId: pending.id,
      folder: SMARTDOC_INBOX_FOLDER,
    });
    pendingCount++;
    notifications.push(
      `ממתין לאישור: ${typeLabel} מ-${result.vendor} (מתוך ${SMARTDOC_INBOX_FOLDER})`
    );
  }

  if (partial) {
    notifications.push(
      "המשיכה מ-Drive הושלמה חלקית. לחצו שוב על רענון להמשך."
    );
  }

  if (files.length === 0 && processed.length === 0) {
    notifications.push(
      `אין קבצים חדשים בתיקיית ${SMARTDOC_INBOX_FOLDER}. סרקו עם CamScanner לתיקייה הזו.`
    );
  }

  return {
    processed,
    notifications,
    demo: false,
    scanned: batch.length,
    pendingCount,
    inboxFolder: SMARTDOC_INBOX_FOLDER,
    partial,
    skippedRemaining: skippedRemaining || undefined,
  };
}

export type { PendingFiling };
