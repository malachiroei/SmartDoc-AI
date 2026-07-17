import { getSupabase, mapSupabaseError } from "@/lib/supabase/client";
import { ensureDriveFolder } from "@/lib/drive/server";
import type { BillAlert, ClassificationResult } from "@/lib/types";

export const PENDING_BILLS_FOLDER_HE = "חשבונות לתשלום";

function isMissingBillAlertsTable(error: { message?: string } | null): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  return msg.includes("bill_alerts") && msg.includes("could not find");
}

export async function listPendingBills(): Promise<BillAlert[]> {
  return listBills({ status: "PENDING_PAYMENT" });
}

export async function listBills(opts?: {
  status?: BillAlert["status"] | "all";
}): Promise<BillAlert[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("bill_alerts")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false });

  const status = opts?.status ?? "PENDING_PAYMENT";
  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingBillAlertsTable(error)) {
      console.warn("[bill_alerts] table missing — run supabase migration");
      return [];
    }
    throw new Error(mapSupabaseError(error));
  }
  return (data ?? []) as BillAlert[];
}

export async function createBillAlert(opts: {
  vendor: string;
  amount?: number | null;
  due_date?: string | null;
  original_bill_file_id: string;
  original_bill_url?: string | null;
  user_id?: string | null;
}): Promise<BillAlert> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bill_alerts")
    .insert({
      vendor: opts.vendor,
      amount: opts.amount ?? null,
      due_date: opts.due_date ?? null,
      status: "PENDING_PAYMENT",
      original_bill_file_id: opts.original_bill_file_id,
      original_bill_url: opts.original_bill_url ?? null,
      user_id: opts.user_id ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(mapSupabaseError(error));
  return data as BillAlert;
}

export async function markBillPaid(opts: {
  billId: string;
  receipt_file_id: string;
}): Promise<BillAlert> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bill_alerts")
    .update({
      status: "PAID_AND_ARCHIVED",
      receipt_file_id: opts.receipt_file_id,
    })
    .eq("id", opts.billId)
    .select("*")
    .single();

  if (error) throw new Error(mapSupabaseError(error));
  return data as BillAlert;
}

export async function getBillById(id: string): Promise<BillAlert | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("bill_alerts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(mapSupabaseError(error));
  return (data as BillAlert) ?? null;
}

/** Create bill alert when AI flags an unpaid bill after Drive upload. */
export async function maybeCreateBillAlert(
  classification: ClassificationResult,
  driveFile: { id: string; webViewLink?: string }
): Promise<BillAlert | null> {
  if (!classification.is_unpaid_bill) return null;

  try {
    await ensureDriveFolder(PENDING_BILLS_FOLDER_HE);
  } catch {
    /* non-blocking */
  }

  try {
    return await createBillAlert({
      vendor: classification.vendor,
      amount: classification.amount ?? null,
      due_date: classification.due_date ?? null,
      original_bill_file_id: driveFile.id,
      original_bill_url: driveFile.webViewLink ?? null,
    });
  } catch (e) {
    console.warn("[bill_alerts] create skipped:", e);
    return null;
  }
}
