import { NextResponse } from "next/server";
import {
  createBillAlert,
  listPendingBills,
} from "@/lib/bills/alerts";
import { mapSupabaseError } from "@/lib/supabase/client";
import type { ClassificationResult } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/bills — list pending payment alerts */
export async function GET() {
  try {
    const bills = await listPendingBills();
    return NextResponse.json({ bills });
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
