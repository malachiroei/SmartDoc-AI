import {
  isPersonalDocType,
  sanitizePersonalClassification,
  VAULT_TITLE_BY_TYPE,
} from "@/lib/ai/personal";
import type { ClassificationResult, PersonalDocument } from "@/lib/types";
import { docTypeHe } from "@/lib/i18n/he";
import { getSupabase, mapSupabaseError } from "@/lib/supabase/client";
import { ensureDriveFolder } from "@/lib/drive/server";
import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";

function isMissingTable(error: { message?: string } | null): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  return msg.includes("personal_documents") && msg.includes("could not find");
}

const TITLE_BY_TYPE = VAULT_TITLE_BY_TYPE;

export async function listPersonalDocuments(): Promise<PersonalDocument[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("personal_documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTable(error)) {
      console.warn("[personal_documents] table missing — run supabase migration");
      return [];
    }
    throw new Error(mapSupabaseError(error));
  }
  return (data ?? []) as PersonalDocument[];
}

export async function createPersonalDocument(opts: {
  doc_type: string;
  title: string;
  document_number?: string | null;
  expiration_date?: string | null;
  file_id: string;
  file_url?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  user_id?: string | null;
}): Promise<PersonalDocument> {
  const supabase = getSupabase();

  // Never persist invoice-leaked titles
  let title = opts.title;
  if (/חשבונית|invoice|דמו/i.test(title) || !title.trim()) {
    title =
      TITLE_BY_TYPE[opts.doc_type] ||
      `${docTypeHe(opts.doc_type)} - מדינת ישראל`;
  }

  let summary = opts.summary ?? null;
  if (summary && /חשבונית|invoice|דמו/i.test(summary)) {
    summary = title;
  }

  const fileUrl =
    opts.file_url ||
    (opts.file_id && !opts.file_id.startsWith("demo-")
      ? `https://drive.google.com/file/d/${opts.file_id}/view`
      : null);

  const { data, error } = await supabase
    .from("personal_documents")
    .insert({
      doc_type: opts.doc_type,
      title,
      document_number: opts.document_number ?? null,
      expiration_date: opts.expiration_date ?? null,
      file_id: opts.file_id,
      file_url: fileUrl,
      summary,
      tags: opts.tags ?? null,
      user_id: opts.user_id ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(mapSupabaseError(error));
  return data as PersonalDocument;
}

export function buildVaultTitle(classification: ClassificationResult): string {
  const clean = sanitizePersonalClassification(classification, null, {
    fillDefaults: false,
  });
  const summary = (clean.summary || "").trim();
  // Prefer OCR Hebrew summary when it includes a real name / detail
  if (
    summary &&
    summary.length >= 4 &&
    !/חשבונית|invoice|דמו|נתוני/i.test(summary)
  ) {
    return summary;
  }
  return (
    TITLE_BY_TYPE[clean.doc_type] ||
    `${docTypeHe(clean.doc_type)} - מדינת ישראל`
  );
}

/** Insert vault record when AI flags a personal document after Drive upload. */
export async function maybeCreatePersonalDocument(
  classification: ClassificationResult,
  driveFile: { id: string; webViewLink?: string },
  previewUrl?: string | null
): Promise<PersonalDocument | null> {
  if (!classification.is_personal_doc && !isPersonalDocType(classification.doc_type)) {
    return null;
  }

  const clean = sanitizePersonalClassification(classification, null, {
    fillDefaults: false,
  });

  try {
    await ensureDriveFolder(PERSONAL_VAULT_FOLDER_HE);
  } catch {
    /* non-blocking */
  }

  const fileUrl =
    driveFile.webViewLink ||
    previewUrl ||
    (driveFile.id && !driveFile.id.startsWith("demo-")
      ? `https://drive.google.com/file/d/${driveFile.id}/view`
      : null);

  try {
    return await createPersonalDocument({
      doc_type: clean.doc_type,
      title: buildVaultTitle(clean),
      document_number: clean.document_number ?? null,
      expiration_date: clean.expiration_date ?? null,
      file_id: driveFile.id,
      file_url: fileUrl,
      summary: clean.summary,
      tags: clean.tags?.length ? clean.tags : null,
    });
  } catch (e) {
    console.warn("[personal_documents] create skipped:", e);
    return null;
  }
}

export async function searchPersonalDocuments(
  keywords: string[]
): Promise<PersonalDocument[]> {
  const all = await listPersonalDocuments();
  if (keywords.length === 0) return all;

  const lower = keywords.map((k) => k.toLowerCase());

  return all.filter((doc) => {
    const haystack = [
      doc.doc_type,
      doc.title,
      doc.summary ?? "",
      doc.document_number ?? "",
      ...(doc.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return lower.some((k) => haystack.includes(k));
  });
}
