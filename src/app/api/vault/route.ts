import { NextResponse } from "next/server";
import {
  createPersonalDocument,
  listPersonalDocuments,
  buildVaultTitle,
} from "@/lib/vault/documents";
import {
  isPersonalDocType,
  sanitizePersonalClassification,
} from "@/lib/ai/personal";
import { mapSupabaseError } from "@/lib/supabase/client";
import type { ClassificationResult } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/vault — list personal vault documents */
export async function GET() {
  try {
    const documents = await listPersonalDocuments();
    return NextResponse.json({ documents });
  } catch (e) {
    console.error("[vault/GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : mapSupabaseError(e) },
      { status: 500 }
    );
  }
}

/** POST /api/vault — create personal document after scan/upload */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const raw = body.classification as ClassificationResult;
    const driveFileId = String(body.driveFileId ?? "");
    const driveFileUrl = body.driveFileUrl
      ? String(body.driveFileUrl)
      : null;
    const previewUrl = body.previewUrl ? String(body.previewUrl) : null;

    const looksPersonal =
      raw?.is_personal_doc ||
      isPersonalDocType(raw?.doc_type) ||
      Boolean(body.forcePersonal);

    if (!looksPersonal || !driveFileId) {
      return NextResponse.json({ skipped: true });
    }

    const classification = sanitizePersonalClassification(raw, null, {
      fillDefaults: false,
    });

    // Prefer real image preview (data URL) so Vault cards can show a thumbnail
    const fileUrl = previewUrl?.startsWith("data:")
      ? previewUrl
      : driveFileUrl ||
        previewUrl ||
        (!driveFileId.startsWith("demo-")
          ? `https://drive.google.com/file/d/${driveFileId}/view`
          : null);

    const doc = await createPersonalDocument({
      doc_type: classification.doc_type,
      title: buildVaultTitle(classification),
      document_number: classification.document_number ?? null,
      expiration_date: classification.expiration_date ?? null,
      file_id: driveFileId,
      file_url: fileUrl,
      summary: classification.summary,
      tags: classification.tags?.length ? classification.tags : null,
    });

    return NextResponse.json({ document: doc });
  } catch (e) {
    console.error("[vault/POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : mapSupabaseError(e) },
      { status: 500 }
    );
  }
}
