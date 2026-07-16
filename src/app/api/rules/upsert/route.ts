import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";
import type { RoutingRule } from "@/lib/types";

/**
 * POST /api/rules/upsert
 * 3-Strike learning: increment confirmation_count; at 3 → is_autonomous = true.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const vendor_or_doc_type = String(body.vendor_or_doc_type ?? "").trim();
    const target_folder_id = String(body.target_folder_id ?? "").trim();
    const target_folder_name = String(body.target_folder_name ?? "").trim();
    const user_id = body.user_id ? String(body.user_id) : null;

    if (!vendor_or_doc_type || !target_folder_id || !target_folder_name) {
      return NextResponse.json(
        {
          error:
            "vendor_or_doc_type, target_folder_id, and target_folder_name are required",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: existing, error: lookupError } = await supabase
      .from("routing_rules")
      .select("*")
      .eq("vendor_or_doc_type", vendor_or_doc_type)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }

    const now = new Date().toISOString();

    if (!existing) {
      const { data: inserted, error: insertError } = await supabase
        .from("routing_rules")
        .insert({
          user_id,
          vendor_or_doc_type,
          target_folder_id,
          target_folder_name,
          confirmation_count: 1,
          is_autonomous: false,
          last_triggered_at: now,
        })
        .select("*")
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        rule: inserted as RoutingRule,
        learned: false,
        confirmation_count: 1,
      });
    }

    const confirmation_count = (existing.confirmation_count ?? 1) + 1;
    const is_autonomous = confirmation_count >= 3 || existing.is_autonomous;
    const learned = confirmation_count >= 3 && !existing.is_autonomous;

    const { data: updated, error: updateError } = await supabase
      .from("routing_rules")
      .update({
        target_folder_id,
        target_folder_name,
        confirmation_count,
        is_autonomous,
        last_triggered_at: now,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      rule: updated as RoutingRule,
      learned,
      confirmation_count,
    });
  } catch (e) {
    console.error("[rules/upsert]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upsert failed" },
      { status: 500 }
    );
  }
}
