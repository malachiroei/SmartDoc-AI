import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export type SupabaseEnvStatus = {
  ok: boolean;
  url?: string;
  missing: string[];
};

/** Validate Supabase env vars without throwing. */
export function checkSupabaseEnv(): SupabaseEnvStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const missing: string[] = [];

  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return { ok: missing.length === 0, url, missing };
}

/**
 * Returns a Supabase client or throws with a clear message.
 * Logs helpful diagnostics to the server console when misconfigured.
 */
export function getSupabase(): SupabaseClient {
  const status = checkSupabaseEnv();

  if (!status.ok) {
    console.error(
      "[supabase] Missing environment variables:",
      status.missing.join(", "),
      "— add them to .env.local and restart the dev server."
    );
    throw new Error(
      `Supabase לא מוגדר: חסרים ${status.missing.join(", ")}`
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}

/** Map low-level Supabase / network errors to readable Hebrew messages. */
export function mapSupabaseError(error: unknown): string {
  let raw: string;

  if (error instanceof Error) {
    raw = error.message;
  } else if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    raw = (error as { message: string }).message;
  } else if (typeof error === "string") {
    raw = error;
  } else {
    raw = "שגיאה לא ידועה בבסיס הנתונים";
  }

  const lower = raw.toLowerCase();

  if (lower.includes("fetch failed") || lower.includes("network")) {
    return "לא ניתן להתחבר ל-Supabase. בדקו חיבור לאינטרנט, כתובת הפרויקט, ושהפרויקט פעיל.";
  }
  if (lower.includes("missing") && lower.includes("supabase")) {
    return raw;
  }
  if (
    lower.includes("row-level security") ||
    lower.includes("rls") ||
    lower.includes("policy")
  ) {
    return "אין הרשאת כתיבה לטבלת routing_rules. יש להגדיר מדיניות RLS ב-Supabase.";
  }
  if (lower.includes("jwt") || lower.includes("invalid api key")) {
    return "מפתח Supabase לא תקין. בדקו את NEXT_PUBLIC_SUPABASE_ANON_KEY.";
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "כלל תיוק זה כבר קיים עבור הספק.";
  }

  return `שגיאת Supabase: ${raw}`;
}
