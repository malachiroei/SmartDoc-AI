import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
import { maybeCreateBillAlert, PENDING_BILLS_FOLDER_HE } from "@/lib/bills/alerts";
import { maybeCreatePersonalDocument } from "@/lib/vault/documents";
import { docTypeHe } from "@/lib/i18n/he";
import type { ClassificationResult, RoutingRule } from "@/lib/types";
import { classifyBuffer } from "@/lib/ai/classify";
import { getSupabase, mapSupabaseError } from "@/lib/supabase/client";
import { uploadBufferToDrive, ensureDriveFolder } from "@/lib/drive/server";
import { getGoogleAccessToken } from "@/lib/google/token";

const GMAIL_QUERY =
  'is:unread (invoice OR bill OR receipt OR חשבונית OR קבלה OR חשבון) has:attachment';

type GmailMessageRef = { id: string; threadId: string };

type ProcessedAttachment = {
  messageId: string;
  fileName: string;
  vendor: string;
  doc_type: string;
  autonomous: boolean;
  folder?: string;
  billAlert?: boolean;
  demo?: boolean;
};

async function gmailFetch(path: string, init?: RequestInit) {
  const token = getGoogleAccessToken();
  if (!token) return null;

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

async function markMessageRead(messageId: string) {
  await gmailFetch(`/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}

export type IngestResult = {
  processed: ProcessedAttachment[];
  notifications: string[];
  demo: boolean;
  scanned: number;
};

/** Demo ingest when Gmail token is not configured */
async function demoIngest(): Promise<IngestResult> {
  const { result } = await classifyBuffer(
    Buffer.from("demo"),
    "image/jpeg"
  );

  const pendingFolder = await ensureDriveFolder(PENDING_BILLS_FOLDER_HE);
  const uploaded = await uploadBufferToDrive({
    buffer: Buffer.from("demo-invoice"),
    fileName: `gmail-demo-${Date.now()}.pdf`,
    mimeType: "application/pdf",
    folderId: pendingFolder.id,
  });

  let billAlert = false;
  if (result.is_unpaid_bill) {
    const created = await maybeCreateBillAlert(result, uploaded);
    billAlert = !!created;
  }

  const typeLabel = docTypeHe(result.doc_type);
  return {
    demo: true,
    scanned: 1,
    processed: [
      {
        messageId: "demo-msg",
        fileName: "demo-invoice.pdf",
        vendor: result.vendor,
        doc_type: typeLabel,
        autonomous: false,
        folder: pendingFolder.name,
        billAlert,
        demo: true,
      },
    ],
    notifications: [
      `🤖 מייל מ-${result.vendor} עם ${typeLabel} תויק אוטומטית לדרייב (מצב דמו)`,
    ],
  };
}

export async function ingestGmailInbox(): Promise<IngestResult> {
  const token = getGoogleAccessToken();
  if (!token) {
    return demoIngest();
  }

  const list = (await gmailFetch(
    `/messages?q=${encodeURIComponent(GMAIL_QUERY)}&maxResults=10`
  )) as { messages?: GmailMessageRef[] };

  const messages = list.messages ?? [];
  const processed: ProcessedAttachment[] = [];
  const notifications: string[] = [];

  for (const msgRef of messages) {
    const full = await gmailFetch(`/messages/${msgRef.id}?format=full`);
    const attachments = extractAttachments(full.payload ?? {});
    let messageHandled = false;

    for (const att of attachments) {
      let buffer: Buffer;
      if (att.data) {
        buffer = decodeBase64Url(att.data);
      } else if (att.attachmentId) {
        const attRes = await gmailFetch(
          `/messages/${msgRef.id}/attachments/${att.attachmentId}`
        );
        buffer = decodeBase64Url(attRes.data);
      } else {
        continue;
      }

      const { result } = await classifyBuffer(buffer, att.mimeType, {
        fileName: att.filename,
      });
      const rule = await lookupRule(result.vendor);

      let folderId: string | undefined;
      let folderName: string;
      let autonomous = false;

      if (rule?.is_autonomous) {
        folderId = rule.target_folder_id;
        folderName = rule.target_folder_name;
        autonomous = true;
      } else if (result.is_personal_doc) {
        const vault = await ensureDriveFolder(PERSONAL_VAULT_FOLDER_HE);
        folderId = vault.id;
        folderName = vault.name;
      } else if (result.is_unpaid_bill) {
        const pending = await ensureDriveFolder(PENDING_BILLS_FOLDER_HE);
        folderId = pending.id;
        folderName = pending.name;
      } else {
        const folder = await ensureDriveFolder(result.suggested_folder_name);
        folderId = folder.id;
        folderName = folder.name;
      }

      const uploaded = await uploadBufferToDrive({
        buffer,
        fileName: att.filename || `gmail-${Date.now()}`,
        mimeType: att.mimeType,
        folderId,
      });

      let billAlert = false;
      if (result.is_unpaid_bill) {
        const created = await maybeCreateBillAlert(result, uploaded);
        billAlert = !!created;
      }

      if (result.is_personal_doc) {
        await maybeCreatePersonalDocument(result, uploaded);
      }

      const typeLabel = docTypeHe(result.doc_type);
      processed.push({
        messageId: msgRef.id,
        fileName: att.filename,
        vendor: result.vendor,
        doc_type: typeLabel,
        autonomous,
        folder: folderName,
        billAlert,
      });

      if (autonomous) {
        notifications.push(
          `🤖 מייל מ-${result.vendor} עם ${typeLabel} תויק אוטומטית לדרייב`
        );
      }

      messageHandled = true;
    }

    if (messageHandled) {
      await markMessageRead(msgRef.id);
    }
  }

  return {
    processed,
    notifications,
    demo: false,
    scanned: messages.length,
  };
}

export async function classifyAndProcessAttachment(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{
  classification: ClassificationResult;
  driveFile: { id: string; webViewLink?: string };
  billAlert: Awaited<ReturnType<typeof maybeCreateBillAlert>>;
  vaultDoc: Awaited<ReturnType<typeof maybeCreatePersonalDocument>>;
}> {
  const { result } = await classifyBuffer(buffer, mimeType, { fileName });

  let folderId: string | undefined;
  if (result.is_personal_doc) {
    const vault = await ensureDriveFolder(PERSONAL_VAULT_FOLDER_HE);
    folderId = vault.id;
  } else if (result.is_unpaid_bill) {
    const pending = await ensureDriveFolder(PENDING_BILLS_FOLDER_HE);
    folderId = pending.id;
  } else {
    const folder = await ensureDriveFolder(result.suggested_folder_name);
    folderId = folder.id;
  }

  const uploaded = await uploadBufferToDrive({
    buffer,
    fileName,
    mimeType,
    folderId,
  });

  const billAlert = await maybeCreateBillAlert(result, uploaded);
  const vaultDoc = await maybeCreatePersonalDocument(result, uploaded);

  return { classification: result, driveFile: uploaded, billAlert, vaultDoc };
}
