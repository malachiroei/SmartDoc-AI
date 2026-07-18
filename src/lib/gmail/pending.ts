import type { ClassificationResult } from "@/lib/types";
import { getSupabase, mapSupabaseError } from "@/lib/supabase/client";

export type PendingFiling = {
  id: string;
  source: string;
  gmail_message_id: string | null;
  original_file_name: string;
  mime_type: string;
  drive_file_id: string | null;
  drive_file_url: string | null;
  classification: ClassificationResult;
  suggested_file_name: string;
  suggested_folder_name: string;
  vendor_key: string;
  confirmation_count: number;
  status: "pending" | "filed" | "dismissed";
  created_at: string;
};

export async function listPendingFilings(): Promise<PendingFiling[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("pending_filings")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(mapSupabaseError(error));
  return (data ?? []) as PendingFiling[];
}

export async function findPendingDuplicate(
  gmailMessageId: string,
  originalFileName: string
): Promise<PendingFiling | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("pending_filings")
    .select("*")
    .eq("gmail_message_id", gmailMessageId)
    .eq("original_file_name", originalFileName)
    .in("status", ["pending", "filed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(mapSupabaseError(error));
  return (data as PendingFiling) ?? null;
}

/** True if this Gmail attachment was already queued or filed (any status except dismissed). */
export async function wasGmailAttachmentSeen(
  gmailMessageId: string,
  originalFileName: string
): Promise<boolean> {
  const row = await findPendingDuplicate(gmailMessageId, originalFileName);
  return Boolean(row);
}

export async function insertPendingFiling(row: {
  source?: string;
  gmail_message_id?: string | null;
  original_file_name: string;
  mime_type: string;
  drive_file_id?: string | null;
  drive_file_url?: string | null;
  classification: ClassificationResult;
  suggested_file_name: string;
  suggested_folder_name: string;
  vendor_key: string;
  confirmation_count?: number;
}): Promise<PendingFiling> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("pending_filings")
    .insert({
      source: row.source ?? "gmail",
      gmail_message_id: row.gmail_message_id ?? null,
      original_file_name: row.original_file_name,
      mime_type: row.mime_type,
      drive_file_id: row.drive_file_id ?? null,
      drive_file_url: row.drive_file_url ?? null,
      classification: row.classification,
      suggested_file_name: row.suggested_file_name,
      suggested_folder_name: row.suggested_folder_name,
      vendor_key: row.vendor_key,
      confirmation_count: row.confirmation_count ?? 0,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw new Error(mapSupabaseError(error));
  return data as PendingFiling;
}

export async function getPendingFiling(id: string): Promise<PendingFiling | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("pending_filings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(mapSupabaseError(error));
  return (data as PendingFiling) ?? null;
}

export async function markPendingFiling(
  id: string,
  status: "filed" | "dismissed"
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("pending_filings")
    .update({ status })
    .eq("id", id);

  if (error) throw new Error(mapSupabaseError(error));
}
