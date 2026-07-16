import { NextResponse } from "next/server";
import {
  checkSupabaseEnv,
  getSupabase,
  mapSupabaseError,
} from "@/lib/supabase/client";

export const runtime = "nodejs";

/**
 * GET /api/health/supabase
 * Lightweight connectivity probe for local Windows / Supabase debugging.
 */
export async function GET() {
  const env = checkSupabaseEnv();

  if (!env.ok) {
    return NextResponse.json(
      {
        status: "error",
        error: `Missing env: ${env.missing.join(", ")}`,
        missing: env.missing,
        hint: "Ensure .env.local exists and restart npm run dev",
      },
      { status: 500 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();

  try {
    const supabase = getSupabase();

    const { count, error } = await supabase
      .from("routing_rules")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("[health/supabase] Query error:", error);
      return NextResponse.json(
        {
          status: "error",
          url,
          error: error.message,
          details: error.details ?? null,
          hint: error.hint ?? null,
          code: error.code ?? null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "ok",
      url,
      routing_rules_count: count ?? 0,
    });
  } catch (err) {
    console.error("[health/supabase] Exception:", err);
    const message =
      err instanceof Error ? err.message : mapSupabaseError(err);
    const stack = err instanceof Error ? err.stack : undefined;

    return NextResponse.json(
      {
        status: "error",
        url,
        error: message,
        stack,
      },
      { status: 500 }
    );
  }
}
