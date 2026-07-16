import { getSupabase, mapSupabaseError } from "@/lib/supabase/client";
import { ensureDriveFolder } from "@/lib/drive/server";
import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
import type { ClassificationResult, PersonalDocument } from "@/lib/types";
import { docTypeHe } from "@/lib/i18n/he";

function isMissingTable(error: { message?: string } | null): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  return msg.includes("personal_documents") && msg.includes("could not find");
}

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
  const { data, error } = await supabase
    .from("personal_documents")
    .insert({
      doc_type: opts.doc_type,
      title: opts.title,
      document_number: opts.document_number ?? null,
      expiration_date: opts.expiration_date ?? null,
      file_id: opts.file_id,
      file_url: opts.file_url ?? null,
      summary: opts.summary ?? null,
      tags: opts.tags ?? null,
      user_id: opts.user_id ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(mapSupabaseError(error));
  return data as PersonalDocument;
}

export function buildVaultTitle(classification: ClassificationResult): string {
  const typeLabel = docTypeHe(classification.doc_type);
  if (classification.summary && classification.summary.length > 2) {
    return classification.summary;
  }
  return `${typeLabel} — ${classification.vendor}`;
}

/** Insert vault record when AI flags a personal document after Drive upload. */
export async function maybeCreatePersonalDocument(
  classification: ClassificationResult,
  driveFile: { id: string; webViewLink?: string }
): Promise<PersonalDocument | null> {
  if (!classification.is_personal_doc) return null;

  try {
    await ensureDriveFolder(PERSONAL_VAULT_FOLDER_HE);
  } catch {
    /* non-blocking */
  }

  try {
    return await createPersonalDocument({
      doc_type: classification.doc_type,
      title: buildVaultTitle(classification),
      document_number: classification.document_number ?? null,
      expiration_date: classification.expiration_date ?? null,
      file_id: driveFile.id,
      file_url: driveFile.webViewLink ?? null,
      summary: classification.summary,
      tags: classification.tags?.length ? classification.tags : null,
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
