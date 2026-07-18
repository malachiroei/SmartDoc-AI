import { NextResponse } from "next/server";
import { listPendingFilings } from "@/lib/gmail/pending";
import {
  confirmPendingFiling,
  dismissPendingFiling,
} from "@/lib/gmail/ingest";
import { mapSupabaseError } from "@/lib/supabase/client";
import { requireGoogleAuth } from "@/lib/auth/require-google";
import type { ClassificationResult } from "@/lib/types";

export async function GET() {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

  try {
    const pending = await listPendingFilings();
    return NextResponse.json({ pending });
  } catch (e) {
    console.error("[gmail/pending GET]", e);
    return NextResponse.json(
      { error: mapSupabaseError(e) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const action = String(body.action ?? "");
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "חסר מזהה פריט" }, { status: 400 });
    }

    if (action === "dismiss") {
      await dismissPendingFiling(id);
      return NextResponse.json({ ok: true, dismissed: true });
    }

    if (action === "confirm") {
      const fileName = String(body.fileName ?? "").trim();
      const folderId = String(body.folderId ?? "").trim();
      const folderName = String(body.folderName ?? "").trim();
      if (!fileName || !folderId || !folderName) {
        return NextResponse.json(
          { error: "נדרשים שם קובץ, תיקייה ומזהה תיקייה" },
          { status: 400 }
        );
      }

      const result = await confirmPendingFiling({
        pendingId: id,
        fileName,
        folderId,
        folderName,
        classification: body.classification as ClassificationResult | undefined,
      });

      return NextResponse.json({
        ok: true,
        learned: result.learned,
        confirmation_count: result.confirmation_count,
        driveFile: result.driveFile,
      });
    }

    return NextResponse.json({ error: "פעולה לא מוכרת" }, { status: 400 });
  } catch (e) {
    console.error("[gmail/pending POST]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : mapSupabaseError(e),
      },
      { status: 500 }
    );
  }
}
