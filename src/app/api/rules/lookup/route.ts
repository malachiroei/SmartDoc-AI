import { NextResponse } from "next/server";
import {
  checkSupabaseEnv,
  getSupabase,
  mapSupabaseError,
} from "@/lib/supabase/client";

/**
 * GET /api/rules/lookup?vendor=Electra
 * Memory lookup: routing_rules where vendor_or_doc_type equals AI vendor.
 */
export async function GET(request: Request) {
  try {
    const env = checkSupabaseEnv();
    if (!env.ok) {
      console.error(
        "[rules/lookup] Supabase env missing:",
        env.missing.join(", ")
      );
      return NextResponse.json(
        {
          error: `Supabase לא מוגדר: חסרים ${env.missing.join(", ")}`,
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const vendor = searchParams.get("vendor")?.trim();

    if (!vendor) {
      return NextResponse.json(
        { error: "פרמטר vendor נדרש" },
        { status: 400 }
      );
    }

    let supabase;
    try {
      supabase = getSupabase();
    } catch (initErr) {
      console.error("[rules/lookup] Supabase init failed:", initErr);
      return NextResponse.json(
        { error: mapSupabaseError(initErr) },
        { status: 500 }
      );
    }

    try {
      const { data, error } = await supabase
        .from("routing_rules")
        .select("*")
        .eq("vendor_or_doc_type", vendor)
        .maybeSingle();

      if (error) {
        console.error("[rules/lookup] Query error:", error.message);
        return NextResponse.json(
          { error: mapSupabaseError(error) },
          { status: 500 }
        );
      }

      return NextResponse.json({ rule: data ?? null });
    } catch (queryErr) {
      console.error("[rules/lookup] Query exception:", queryErr);
      return NextResponse.json(
        { error: mapSupabaseError(queryErr) },
        { status: 500 }
      );
    }
  } catch (e) {
    console.error("[rules/lookup] Unhandled:", e);
    return NextResponse.json(
      { error: mapSupabaseError(e) },
      { status: 500 }
    );
  }
}
