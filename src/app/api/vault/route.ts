import { NextResponse } from "next/server";
import {
  createPersonalDocument,
  listPersonalDocuments,
  buildVaultTitle,
} from "@/lib/vault/documents";
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
    const classification = body.classification as ClassificationResult;
    const driveFileId = String(body.driveFileId ?? "");
    const driveFileUrl = body.driveFileUrl
      ? String(body.driveFileUrl)
      : null;

    if (!classification?.is_personal_doc || !driveFileId) {
      return NextResponse.json({ skipped: true });
    }

    const doc = await createPersonalDocument({
      doc_type: classification.doc_type,
      title: buildVaultTitle(classification),
      document_number: classification.document_number ?? null,
      expiration_date: classification.expiration_date ?? null,
      file_id: driveFileId,
      file_url: driveFileUrl,
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
