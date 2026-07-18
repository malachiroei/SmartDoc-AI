import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
import { maybeCreateBillAlert, PENDING_BILLS_FOLDER_HE } from "@/lib/bills/alerts";
import { maybeCreatePersonalDocument } from "@/lib/vault/documents";
import { docTypeHe } from "@/lib/i18n/he";
import type { ClassificationResult, RoutingRule } from "@/lib/types";
import { classifyBuffer } from "@/lib/ai/classify";
import { syntheticInvoiceResult } from "@/lib/ai/vision-prep";
import { getSupabase, mapSupabaseError } from "@/lib/supabase/client";
import {
  uploadBufferToDrive,
  ensureDriveFolder,
  moveAndRenameDriveFile,
  trashDriveFile,
} from "@/lib/drive/server";
import { makeScanFileName, sanitizeFileBase } from "@/lib/drive/filename";
import { resolveGoogleBearerToken } from "@/lib/google/token";
import {
  findPendingDuplicate,
  insertPendingFiling,
  type PendingFiling,
} from "@/lib/gmail/pending";

export const PENDING_REVIEW_FOLDER_HE = "ממתין לאישור";

/**
 * Search ALL mail (inbox + labels/folders), not only inbox.
 * 1) Fresh unread invoices/receipts
 * 2) Utility / Mei Avivim water bills across folders (including older mail)
 */
const GMAIL_QUERIES = [
  'is:unread (invoice OR bill OR receipt OR חשבונית OR קבלה OR "חשבון לתשלום" OR unpaid) has:attachment',
  '("מי אביבים" OR "מי-אביבים" OR meiaavivim OR "mei avivim" OR חשבון מים OR (אישור תשלום מים)) has:attachment newer_than:3y',
] as const;

/** Stay under Vercel/proxy ~60s limits (Hobby often 504 earlier) */
const MAX_MESSAGES = 4;
const MAX_NEW_CLASSIFICATIONS = 2;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const TIME_BUDGET_MS = 48_000;

type GmailMessageRef = { id: string; threadId: string };

type ProcessedAttachment = {
  messageId: string;
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

async function gmailFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API: ${err}`);
  }

  return res.json();
}

function decodeBase64Url(data: string): Buffer {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function headerValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string
): string {
  const hit = headers?.find(
    (h) => (h.name || "").toLowerCase() === name.toLowerCase()
  );
  return (hit?.value || "").trim();
}

async function listGmailMessageIds(token: string): Promise<GmailMessageRef[]> {
  const seen = new Set<string>();
  const out: GmailMessageRef[] = [];

  for (const q of GMAIL_QUERIES) {
    const list = (await gmailFetch(
      token,
      `/messages?q=${encodeURIComponent(q)}&maxResults=${MAX_MESSAGES}`
    )) as { messages?: GmailMessageRef[] };

    for (const m of list.messages ?? []) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
      if (out.length >= MAX_MESSAGES) return out;
    }
  }

  return out;
}

function extractAttachments(payload: {
  parts?: Array<{
    mimeType?: string;
    filename?: string;
    body?: { attachmentId?: string; data?: string; size?: number };
    parts?: unknown[];
  }>;
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; data?: string };
}): Array<{ filename: string; mimeType: string; attachmentId?: string; data?: string }> {
  const out: Array<{
    filename: string;
    mimeType: string;
    attachmentId?: string;
    data?: string;
  }> = [];

  function walk(part: typeof payload) {
    if (part.filename && part.body?.attachmentId) {
      out.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        attachmentId: part.body.attachmentId,
      });
    } else if (part.filename && part.body?.data) {
      out.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        data: part.body.data,
      });
    }
    if (part.parts) {
      for (const child of part.parts as typeof payload[]) {
        walk(child);
      }
    }
  }

  walk(payload);
  return out.filter(
    (a) =>
      a.mimeType.startsWith("image/") ||
      a.mimeType === "application/pdf"
  );
}

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

async function markMessageRead(token: string, messageId: string) {
  await gmailFetch(token, `/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}

function extFromMime(mimeType: string, fileName: string): "pdf" | "png" | "jpg" {
  if (mimeType.includes("pdf") || /\.pdf$/i.test(fileName)) return "pdf";
  if (mimeType.includes("png") || /\.png$/i.test(fileName)) return "png";
  return "jpg";
}

function suggestedFolderFor(result: ClassificationResult): string {
  if (result.is_personal_doc) return PERSONAL_VAULT_FOLDER_HE;
  // Prefer AI / enriched folder (e.g. חשבונות מים) so 3-strike learns that path
  if (result.suggested_folder_name?.trim()) {
    return result.suggested_folder_name.trim();
  }
  if (result.is_unpaid_bill) return PENDING_BILLS_FOLDER_HE;
  return "מסמכים";
}

/** Reinforce Mei Avivim / water-bill routing from email Subject/From + AI result */
function enrichUtilityBillClassification(
  result: ClassificationResult,
  hint: string
): ClassificationResult {
  const blob = [
    hint,
    result.vendor,
    result.summary,
    result.suggested_folder_name,
    result.doc_type,
  ].join(" ");

  const isMeiAvivim = /אביבים|mei[_\s-]?avivim|meiaavivim/i.test(blob);
  const isWater = isMeiAvivim || /חשבון מים|מים/.test(blob);
  if (!isWater) return result;

  const paidHint =
    /אישור תשלום|שולם(?:\s|$)|paid|payment confirmation|קבלה על תשלום/i.test(
      blob
    );
  const looksLikeBill =
    /לתשלום|יתרה|due|unpaid|חשבון מים|bill/i.test(blob) ||
    result.doc_type === "Bill" ||
    Boolean(result.is_unpaid_bill);

  const out: ClassificationResult = { ...result };
  if (isMeiAvivim) out.vendor = "Mei_Avivim";
  out.suggested_folder_name =
    out.suggested_folder_name?.includes("מים") ||
    out.suggested_folder_name?.includes("אביבים")
      ? out.suggested_folder_name
      : "חשבונות מים";

  if (paidHint || out.doc_type === "Receipt") {
    out.doc_type = "Receipt";
    out.is_unpaid_bill = false;
    if (!/מים|תשלום/.test(out.summary || "")) {
      out.summary = "אישור תשלום מים";
    }
  } else if (looksLikeBill) {
    out.doc_type = "Bill";
    out.is_unpaid_bill = true;
    if (!/חשבון מים/.test(out.summary || "")) {
      out.summary = out.summary?.trim()
        ? out.summary
        : "חשבון מים";
    }
  }

  return out;
}

export type IngestResult = {
  processed: ProcessedAttachment[];
  notifications: string[];
  demo: boolean;
  scanned: number;
  pendingCount: number;
  /** True when we stopped early to avoid gateway timeout */
  partial?: boolean;
  skippedRemaining?: number;
};

/** Demo ingest — queue a pending item (no fake Vision call, no auto-file) */
async function demoIngest(): Promise<IngestResult> {
  const result = syntheticInvoiceResult();
  const smartName = makeScanFileName(result, "pdf");
  const holding = await ensureDriveFolder(PENDING_REVIEW_FOLDER_HE);
  const uploaded = await uploadBufferToDrive({
    buffer: Buffer.from(
      "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    ),
    fileName: `pending-${smartName}`,
    mimeType: "application/pdf",
    folderId: holding.id,
  });

  const pending = await insertPendingFiling({
    source: "gmail-demo",
    gmail_message_id: `demo-${Date.now()}`,
    original_file_name: "demo-invoice.pdf",
    mime_type: "application/pdf",
    drive_file_id: uploaded.id,
    drive_file_url: uploaded.webViewLink ?? null,
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
    processed: [
      {
        messageId: "demo-msg",
        fileName: smartName,
        vendor: result.vendor,
        doc_type: docTypeHe(result.doc_type),
        autonomous: false,
        pending: true,
        pendingId: pending.id,
        folder: PENDING_REVIEW_FOLDER_HE,
        demo: true,
      },
    ],
    notifications: [
      `מצב דמו: נוסף מסמך לאישור (1/3) — אשרו שם תיקייה ושם קובץ לפני תיוק אוטומטי`,
    ],
  };
}

export async function ingestGmailInbox(): Promise<IngestResult> {
  const token = await resolveGoogleBearerToken();
  if (!token) {
    return demoIngest();
  }

  const started = Date.now();
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - started);

  const list = await listGmailMessageIds(token);
  const messages = list;
  const processed: ProcessedAttachment[] = [];
  const notifications: string[] = [];
  let pendingCount = 0;
  let newClassifications = 0;
  let skippedRemaining = 0;
  let partial = false;

  for (const msgRef of messages) {
    if (timeLeft() < 8_000) {
      partial = true;
      skippedRemaining += 1;
      continue;
    }

    const full = await gmailFetch(token, `/messages/${msgRef.id}?format=full`);
    const attachments = extractAttachments(full.payload ?? {});
    const labelIds: string[] = Array.isArray(full.labelIds) ? full.labelIds : [];
    const wasUnread = labelIds.includes("UNREAD");
    const subject = headerValue(full.payload?.headers, "Subject");
    const from = headerValue(full.payload?.headers, "From");
    const classifyHint = [subject, from].filter(Boolean).join(" | ");
    let messageHandled = false;

    for (const att of attachments) {
      if (timeLeft() < 8_000) {
        partial = true;
        break;
      }

      const originalName = att.filename || `gmail-${Date.now()}`;

      const dup = await findPendingDuplicate(msgRef.id, originalName);
      if (dup) {
        // Already filed — skip silently; still pending — show again
        if (dup.status === "filed") {
          messageHandled = true;
          continue;
        }
        processed.push({
          messageId: msgRef.id,
          fileName: dup.suggested_file_name,
          vendor: dup.vendor_key,
          doc_type: docTypeHe(dup.classification.doc_type),
          autonomous: false,
          pending: true,
          pendingId: dup.id,
          folder: PENDING_REVIEW_FOLDER_HE,
        });
        pendingCount++;
        messageHandled = true;
        continue;
      }

      if (newClassifications >= MAX_NEW_CLASSIFICATIONS) {
        partial = true;
        skippedRemaining += 1;
        break;
      }

      let buffer: Buffer;
      if (att.data) {
        buffer = decodeBase64Url(att.data);
      } else if (att.attachmentId) {
        const attRes = await gmailFetch(
          token,
          `/messages/${msgRef.id}/attachments/${att.attachmentId}`
        );
        buffer = decodeBase64Url(attRes.data);
      } else {
        continue;
      }

      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        notifications.push(
          `דולג: ${originalName} גדול מדי לסיווג מהיר (${Math.round(buffer.length / 1024 / 1024)}MB)`
        );
        continue;
      }

      // Gemini + Drive are the slow path — budget one at a time
      newClassifications++;
      let result: ClassificationResult;
      try {
        const classified = await classifyBuffer(buffer, att.mimeType, {
          fileName: originalName,
          hint: classifyHint,
        });
        result = classified.result;
        result = enrichUtilityBillClassification(result, classifyHint);
      } catch (classifyErr) {
        console.warn("[gmail/ingest] classify failed:", classifyErr);
        notifications.push(
          `סיווג נכשל עבור ${originalName}: ${
            classifyErr instanceof Error ? classifyErr.message.slice(0, 120) : "שגיאה"
          }`
        );
        continue;
      }

      const rule = await lookupRule(result.vendor);
      const ext = extFromMime(att.mimeType, originalName);
      const smartName = makeScanFileName(result, ext);
      const typeLabel = docTypeHe(result.doc_type);

      // Only auto-file after 3 user approvals (is_autonomous)
      if (rule?.is_autonomous) {
        const uploaded = await uploadBufferToDrive({
          buffer,
          fileName: smartName,
          mimeType: att.mimeType,
          folderId: rule.target_folder_id,
        });

        let billAlert = false;
        if (result.is_unpaid_bill) {
          billAlert = !!(await maybeCreateBillAlert(result, uploaded));
        }
        if (result.is_personal_doc) {
          await maybeCreatePersonalDocument(result, uploaded);
        }

        processed.push({
          messageId: msgRef.id,
          fileName: smartName,
          vendor: result.vendor,
          doc_type: typeLabel,
          autonomous: true,
          folder: rule.target_folder_name,
          billAlert,
        });
        notifications.push(
          `🤖 מייל מ-${result.vendor} עם ${typeLabel} תויק אוטומטית לדרייב (${rule.target_folder_name})`
        );
        messageHandled = true;
        continue;
      }

      // Queue for user confirmation (name + folder) — 3-strike learning
      const holding = await ensureDriveFolder(PENDING_REVIEW_FOLDER_HE);
      const holdingUpload = await uploadBufferToDrive({
        buffer,
        fileName: `ממתין-${smartName}`,
        mimeType: att.mimeType,
        folderId: holding.id,
      });

      const pending = await insertPendingFiling({
        source: "gmail",
        gmail_message_id: msgRef.id,
        original_file_name: originalName,
        mime_type: att.mimeType,
        drive_file_id: holdingUpload.id,
        drive_file_url: holdingUpload.webViewLink ?? null,
        classification: result,
        suggested_file_name: smartName,
        suggested_folder_name: suggestedFolderFor(result),
        vendor_key: result.vendor,
        confirmation_count: rule?.confirmation_count ?? 0,
      });

      processed.push({
        messageId: msgRef.id,
        fileName: smartName,
        vendor: result.vendor,
        doc_type: typeLabel,
        autonomous: false,
        pending: true,
        pendingId: pending.id,
        folder: PENDING_REVIEW_FOLDER_HE,
      });
      pendingCount++;
      notifications.push(
        `ממתין לאישור: ${typeLabel} מ-${result.vendor} (אישור ${(rule?.confirmation_count ?? 0) + 1}/3) — בדקו שם קובץ ותיקייה`
      );
      messageHandled = true;
    }

    if (messageHandled && wasUnread) {
      try {
        await markMessageRead(token, msgRef.id);
      } catch (markErr) {
        console.warn("[gmail/ingest] mark read failed:", markErr);
      }
    }
  }

  if (partial) {
    notifications.push(
      "הסריקה הושלמה חלקית (מגבלת זמן בשרת). לחצו שוב על סריקה להמשך המיילים הבאים."
    );
  }

  return {
    processed,
    notifications,
    demo: false,
    scanned: messages.length,
    pendingCount,
    partial,
    skippedRemaining: skippedRemaining || undefined,
  };
}

export async function confirmPendingFiling(opts: {
  pendingId: string;
  fileName: string;
  folderId: string;
  folderName: string;
  classification?: ClassificationResult;
}): Promise<{
  filing: PendingFiling;
  driveFile: { id: string; webViewLink?: string; name: string };
  learned: boolean;
  confirmation_count: number;
}> {
  const { getPendingFiling, markPendingFiling } = await import(
    "@/lib/gmail/pending"
  );
  const pending = await getPendingFiling(opts.pendingId);
  if (!pending || pending.status !== "pending") {
    throw new Error("הפריט לאישור לא נמצא או כבר טופל");
  }
  if (!pending.drive_file_id) {
    throw new Error("חסר קובץ Drive לפריט הממתין");
  }

  const classification = opts.classification ?? pending.classification;
  const safeName = sanitizeFileBase(
    opts.fileName.replace(/\.(pdf|png|jpe?g)$/i, "")
  );
  const ext = extFromMime(pending.mime_type, pending.original_file_name);
  const finalName = `${safeName}.${ext}`;

  const moved = await moveAndRenameDriveFile({
    fileId: pending.drive_file_id,
    newName: finalName,
    newParentId: opts.folderId,
  });

  // Teach routing rule (3-strike)
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const vendor = classification.vendor;
  const { data: existing } = await supabase
    .from("routing_rules")
    .select("*")
    .eq("vendor_or_doc_type", vendor)
    .maybeSingle();

  let confirmation_count = 1;
  let learned = false;
  if (!existing) {
    await supabase.from("routing_rules").insert({
      vendor_or_doc_type: vendor,
      target_folder_id: opts.folderId,
      target_folder_name: opts.folderName,
      confirmation_count: 1,
      is_autonomous: false,
      last_triggered_at: now,
    });
  } else {
    confirmation_count = (existing.confirmation_count ?? 1) + 1;
    const is_autonomous =
      confirmation_count >= 3 || Boolean(existing.is_autonomous);
    learned = confirmation_count >= 3 && !existing.is_autonomous;
    await supabase
      .from("routing_rules")
      .update({
        target_folder_id: opts.folderId,
        target_folder_name: opts.folderName,
        confirmation_count,
        is_autonomous,
        last_triggered_at: now,
      })
      .eq("id", existing.id);
  }

  if (classification.is_unpaid_bill) {
    await maybeCreateBillAlert(classification, moved);
  }
  if (classification.is_personal_doc) {
    await maybeCreatePersonalDocument(classification, moved);
  }

  await markPendingFiling(opts.pendingId, "filed");

  return {
    filing: pending,
    driveFile: moved,
    learned,
    confirmation_count,
  };
}

export async function dismissPendingFiling(pendingId: string): Promise<void> {
  const { getPendingFiling, markPendingFiling } = await import(
    "@/lib/gmail/pending"
  );
  const pending = await getPendingFiling(pendingId);
  if (!pending || pending.status !== "pending") return;
  if (pending.drive_file_id) {
    await trashDriveFile(pending.drive_file_id);
  }
  await markPendingFiling(pendingId, "dismissed");
}
