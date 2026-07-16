import { NextResponse } from "next/server";
import { recordFeedback } from "@/lib/ai/memory";
import { mapSupabaseError } from "@/lib/supabase/client";

export const runtime = "nodejs";

/**
 * POST /api/ai/feedback
 * Record a user correction to the ai_feedback_ledger for future few-shot learning.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const corrected_doc_type = String(body.corrected_doc_type ?? "").trim();
    const corrected_vendor = String(body.corrected_vendor ?? "").trim();

    if (!corrected_doc_type || !corrected_vendor) {
      return NextResponse.json(
        { error: "נדרשים corrected_doc_type ו-corrected_vendor" },
        { status: 400 }
      );
    }

    const recorded = await recordFeedback({
      original_doc_type: body.original_doc_type
        ? String(body.original_doc_type)
        : null,
      original_vendor: body.original_vendor
        ? String(body.original_vendor)
        : null,
      original_folder: body.original_folder
        ? String(body.original_folder)
        : null,
      corrected_doc_type,
      corrected_vendor,
      corrected_folder: body.corrected_folder
        ? String(body.corrected_folder)
        : null,
      corrected_summary: body.corrected_summary
        ? String(body.corrected_summary)
        : null,
      is_personal_doc: Boolean(body.is_personal_doc),
      notes: body.notes ? String(body.notes) : null,
    });

    if (!recorded) {
      return NextResponse.json({
        ok: false,
        skipped: true,
        message: "יומן הפידבק לא זמין — הריצו את המיגרציה ב-Supabase",
      });
    }

    return NextResponse.json({ ok: true, id: recorded.id });
  } catch (e) {
    console.error("[ai/feedback]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : mapSupabaseError(e) },
      { status: 500 }
    );
  }
}
