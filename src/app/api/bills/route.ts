import { NextResponse } from "next/server";
import {
  createBillAlert,
  listBills,
} from "@/lib/bills/alerts";
import { mapSupabaseError } from "@/lib/supabase/client";
import type { BillAlertStatus, ClassificationResult } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/bills?status=pending|paid|all — bill status report */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const raw = (url.searchParams.get("status") || "pending").toLowerCase();
    let status: BillAlertStatus | "all" = "PENDING_PAYMENT";
    if (raw === "paid" || raw === "paid_and_archived") {
      status = "PAID_AND_ARCHIVED";
    } else if (raw === "all") {
      status = "all";
    } else if (raw === "pending" || raw === "pending_payment") {
      status = "PENDING_PAYMENT";
    }

    const bills = await listBills({ status });
    const pending = bills.filter((b) => b.status === "PENDING_PAYMENT").length;
    const paid = bills.filter((b) => b.status === "PAID_AND_ARCHIVED").length;

    return NextResponse.json({
      bills,
      summary: {
        total: bills.length,
        unpaid: status === "all" ? pending : status === "PENDING_PAYMENT" ? bills.length : pending,
        paid: status === "all" ? paid : status === "PAID_AND_ARCHIVED" ? bills.length : paid,
        filter: raw,
      },
    });
  } catch (e) {
    console.error("[bills/GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : mapSupabaseError(e) },
      { status: 500 }
    );
  }
}

/** POST /api/bills — create bill alert after scan/upload */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const classification = body.classification as ClassificationResult;
    const driveFileId = String(body.driveFileId ?? "");
    const driveFileUrl = body.driveFileUrl
      ? String(body.driveFileUrl)
      : null;

    if (!classification?.is_unpaid_bill || !driveFileId) {
      return NextResponse.json({ skipped: true });
    }

    const bill = await createBillAlert({
      vendor: classification.vendor,
      amount: classification.amount ?? null,
      due_date: classification.due_date ?? null,
      original_bill_file_id: driveFileId,
      original_bill_url: driveFileUrl,
    });

    return NextResponse.json({ bill });
  } catch (e) {
    console.error("[bills/POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : mapSupabaseError(e) },
      { status: 500 }
    );
  }
}
