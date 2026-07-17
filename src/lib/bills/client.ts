import { fetchJsonOk } from "@/lib/api/client-fetch";
import type { BillAlert, ClassificationResult } from "@/lib/types";
import { he } from "@/lib/i18n/he";

export async function fetchPendingBills(): Promise<BillAlert[]> {
  return fetchBills("pending");
}

export async function fetchBills(
  status: "pending" | "paid" | "all" = "pending"
): Promise<BillAlert[]> {
  const data = await fetchJsonOk<{ bills: BillAlert[] }>(
    `/api/bills?status=${encodeURIComponent(status)}`,
    { networkError: he.bills.loadError }
  );
  return data.bills;
}

export async function createBillFromClassification(
  classification: ClassificationResult,
  driveFile: { id: string; webViewLink?: string }
): Promise<BillAlert | null> {
  if (!classification.is_unpaid_bill) return null;

  const data = await fetchJsonOk<{ bill?: BillAlert; skipped?: boolean }>(
    "/api/bills",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classification,
        driveFileId: driveFile.id,
        driveFileUrl: driveFile.webViewLink ?? null,
      }),
      networkError: he.bills.createError,
    }
  );

  return data.bill ?? null;
}

export async function ingestGmail(): Promise<{
  processed: unknown[];
  notifications: string[];
  demo: boolean;
  scanned: number;
}> {
  return fetchJsonOk("/api/gmail/ingest", {
    method: "POST",
    networkError: he.gmail.ingestError,
  });
}

export async function payBillWithReceipt(
  billId: string,
  file: File
): Promise<{ message: string }> {
  const form = new FormData();
  form.append("file", file);

  const data = await fetchJsonOk<{ message: string }>(
    `/api/bills/${billId}/pay`,
    {
      method: "POST",
      body: form,
      networkError: he.bills.payError,
    }
  );

  return { message: data.message };
}
