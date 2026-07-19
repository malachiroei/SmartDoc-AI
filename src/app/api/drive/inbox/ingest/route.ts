import { NextResponse } from "next/server";
import { ingestDriveInbox } from "@/lib/drive/inbox-ingest";
import { mapSupabaseError } from "@/lib/supabase/client";
import { requireGoogleAuth } from "@/lib/auth/require-google";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/drive/inbox/ingest
 * Pull PDF/images from SmartDoc_Inbox, classify, queue pending_filings
 * (or auto-file when rule is autonomous). Files stay in Inbox until approved.
 */
export async function POST() {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

  try {
    const result = await ingestDriveInbox();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[drive/inbox/ingest]", e);
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
