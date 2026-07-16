import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";

/**
 * GET /api/rules/lookup?vendor=Electra
 * Memory lookup: routing_rules where vendor_or_doc_type equals AI vendor.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const vendor = searchParams.get("vendor")?.trim();

    if (!vendor) {
      return NextResponse.json(
        { error: "vendor query param is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("routing_rules")
      .select("*")
      .eq("vendor_or_doc_type", vendor)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lookup failed" },
      { status: 500 }
    );
  }
}
