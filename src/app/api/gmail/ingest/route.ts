import { NextResponse } from "next/server";
import { ingestGmailInbox } from "@/lib/gmail/ingest";
import { mapSupabaseError } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/gmail/ingest
 * Poll Gmail for bill/invoice attachments, classify, route, and mark read.
 */
export async function POST() {
  try {
    const result = await ingestGmailInbox();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[gmail/ingest]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : mapSupabaseError(e),
        processed: [],
        notifications: [],
      },
      { status: 500 }
    );
  }
}
