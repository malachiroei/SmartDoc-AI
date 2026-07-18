import { NextResponse } from "next/server";
import {
  checkSupabaseEnv,
  getSupabase,
  mapSupabaseError,
} from "@/lib/supabase/client";
import { requireGoogleAuth } from "@/lib/auth/require-google";

/**
 * POST /api/rules/upsert
 * 3-Strike learning: increment confirmation_count; at 3 → is_autonomous = true.
 */
export async function POST(request: Request) {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

  try {
    const env = checkSupabaseEnv();
    if (!env.ok) {
      console.error(
        "[rules/upsert] Supabase env missing:",
        env.missing.join(", ")
      );
      return NextResponse.json(
        {
          error: `Supabase לא מוגדר: חסרים ${env.missing.join(", ")}`,
        },
        { status: 500 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "גוף הבקשה אינו JSON תקין" },
        { status: 400 }
      );
    }

    const vendor_or_doc_type = String(body.vendor_or_doc_type ?? "").trim();
    const target_folder_id = String(body.target_folder_id ?? "").trim();
    const target_folder_name = String(body.target_folder_name ?? "").trim();
    const user_id = body.user_id ? String(body.user_id) : null;

    if (!vendor_or_doc_type || !target_folder_id || !target_folder_name) {
      return NextResponse.json(
        {
          error:
            "חסרים שדות חובה: vendor_or_doc_type, target_folder_id, target_folder_name",
        },
        { status: 400 }
      );
    }

    let supabase;
    try {
      supabase = getSupabase();
    } catch (initErr) {
      console.error("[rules/upsert] Supabase init failed:", initErr);
      return NextResponse.json(
        {
          error: mapSupabaseError(initErr),
        },
        { status: 500 }
      );
    }

    let existing;
    try {
      const { data, error: lookupError } = await supabase
        .from("routing_rules")
        .select("*")
        .eq("vendor_or_doc_type", vendor_or_doc_type)
        .maybeSingle();

      if (lookupError) {
        console.error("[rules/upsert] Lookup error:", lookupError.message);
        return NextResponse.json(
          { error: mapSupabaseError(lookupError) },
          { status: 500 }
        );
      }
      existing = data;
    } catch (lookupErr) {
      console.error("[rules/upsert] Lookup exception:", lookupErr);
      return NextResponse.json(
        { error: mapSupabaseError(lookupErr) },
        { status: 500 }
      );
    }

    const now = new Date().toISOString();

    if (!existing) {
      try {
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
          console.error("[rules/upsert] Insert error:", insertError.message);
          return NextResponse.json(
            { error: mapSupabaseError(insertError) },
            { status: 500 }
          );
        }

        return NextResponse.json({
          rule: inserted,
          learned: false,
          confirmation_count: 1,
        });
      } catch (insertErr) {
        console.error("[rules/upsert] Insert exception:", insertErr);
        return NextResponse.json(
          { error: mapSupabaseError(insertErr) },
          { status: 500 }
        );
      }
    }

    const confirmation_count = (existing.confirmation_count ?? 1) + 1;
    const is_autonomous = confirmation_count >= 3 || existing.is_autonomous;
    const learned = confirmation_count >= 3 && !existing.is_autonomous;

    try {
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
        console.error("[rules/upsert] Update error:", updateError.message);
        return NextResponse.json(
          { error: mapSupabaseError(updateError) },
          { status: 500 }
        );
      }

      return NextResponse.json({
        rule: updated,
        learned,
        confirmation_count,
      });
    } catch (updateErr) {
      console.error("[rules/upsert] Update exception:", updateErr);
      return NextResponse.json(
        { error: mapSupabaseError(updateErr) },
        { status: 500 }
      );
    }
  } catch (e) {
    console.error("[rules/upsert] Unhandled:", e);
    return NextResponse.json(
      { error: mapSupabaseError(e) },
      { status: 500 }
    );
  }
}
