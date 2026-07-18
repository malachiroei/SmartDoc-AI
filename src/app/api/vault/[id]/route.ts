import { NextResponse } from "next/server";
import { deletePersonalDocument } from "@/lib/vault/documents";
import { mapSupabaseError } from "@/lib/supabase/client";
import { requireGoogleAuth } from "@/lib/auth/require-google";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/vault/[id] — remove a personal vault document */
export async function DELETE(_request: Request, context: Ctx) {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "חסר מזהה מסמך" }, { status: 400 });
    }

    await deletePersonalDocument(id.trim());
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("[vault/DELETE]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : mapSupabaseError(e) },
      { status: 500 }
    );
  }
}
