import { NextResponse } from "next/server";
import { retrieveFromVault } from "@/lib/vault/retrieve";
import { mapSupabaseError } from "@/lib/supabase/client";

export const runtime = "nodejs";

/**
 * POST /api/agent/retrieve
 * Natural-language Hebrew vault retrieval agent.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body.query ?? body.q ?? "").trim();

    if (!query) {
      return NextResponse.json(
        { error: "נא להזין שאילתת חיפוש" },
        { status: 400 }
      );
    }

    const result = await retrieveFromVault(query);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[agent/retrieve]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : mapSupabaseError(e),
        answer: "אירעה שגיאה בשליפה מהכספת. נסו שוב.",
        documents: [],
      },
      { status: 500 }
    );
  }
}
