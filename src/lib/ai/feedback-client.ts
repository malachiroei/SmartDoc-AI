import { fetchJsonOk } from "@/lib/api/client-fetch";
import type { ClassificationResult, DocType } from "@/lib/types";
import { he } from "@/lib/i18n/he";

export async function submitClassificationFeedback(opts: {
  original: ClassificationResult;
  corrected: {
    doc_type: DocType | string;
    vendor: string;
    folder?: string | null;
    summary?: string | null;
    is_personal_doc?: boolean;
  };
  notes?: string;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const changed =
    opts.original.doc_type !== opts.corrected.doc_type ||
    opts.original.vendor !== opts.corrected.vendor.replace(/\s+/g, "_") ||
    (opts.corrected.folder &&
      opts.corrected.folder !== opts.original.suggested_folder_name);

  if (!changed) return { ok: true, skipped: true };

  return fetchJsonOk("/api/ai/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      original_doc_type: opts.original.doc_type,
      original_vendor: opts.original.vendor,
      original_folder: opts.original.suggested_folder_name,
      corrected_doc_type: opts.corrected.doc_type,
      corrected_vendor: opts.corrected.vendor,
      corrected_folder: opts.corrected.folder ?? null,
      corrected_summary: opts.corrected.summary ?? opts.original.summary,
      is_personal_doc: opts.corrected.is_personal_doc ?? false,
      notes: opts.notes ?? null,
    }),
    networkError: he.feedback.saveError,
  });
}
