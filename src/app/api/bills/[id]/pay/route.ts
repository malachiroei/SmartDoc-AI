import { NextResponse } from "next/server";
import { getBillById, markBillPaid } from "@/lib/bills/alerts";
import { uploadBufferToDrive, ensureDriveFolder } from "@/lib/drive/server";
import { mapSupabaseError } from "@/lib/supabase/client";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/bills/[id]/pay
 * Upload payment receipt, archive bill, update Supabase.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const bill = await getBillById(id);

    if (!bill) {
      return NextResponse.json({ error: "חשבון לא נמצא" }, { status: 404 });
    }
    if (bill.status !== "PENDING_PAYMENT") {
      return NextResponse.json({ error: "החשבון כבר שולם" }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "נדרש קובץ קבלה" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName =
      file instanceof File ? file.name : `receipt-${bill.vendor}-${Date.now()}.jpg`;
    const mimeType = file.type || "image/jpeg";

    const archiveFolder = await ensureDriveFolder(
      `ארכיון ${bill.vendor}`,
      "root"
    );

    const receipt = await uploadBufferToDrive({
      buffer,
      fileName: `קבלה-${fileName}`,
      mimeType,
      folderId: archiveFolder.id,
    });

    const updated = await markBillPaid({
      billId: id,
      receipt_file_id: receipt.id,
    });

    return NextResponse.json({
      bill: updated,
      receipt,
      archiveFolder,
      message: "החשבון סומן כשולם! הקבלה צורפה וארכיון המסמכים עודכן ב-Google Drive.",
    });
  } catch (e) {
    console.error("[bills/pay]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : mapSupabaseError(e) },
      { status: 500 }
    );
  }
}
