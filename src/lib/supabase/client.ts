import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Prefer IPv4 on Windows — avoids ~7s hang on IPv6 DNS for *.supabase.co */
if (typeof window === "undefined") {
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    /* older Node — ignore */
  }
}

let client: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;
let envWarningLogged = false;
let serviceRoleWarningLogged = false;

export type SupabaseEnvStatus = {
  ok: boolean;
  url?: string;
  missing: string[];
  /** True when server can bypass RLS via service role */
  hasServiceRole?: boolean;
};

function logMissingEnvOnce(missing: string[]) {
  if (envWarningLogged) return;
  envWarningLogged = true;
  console.error(
    "❌ CRITICAL: Supabase environment variables are missing on the server!",
    missing.join(", "),
    "— Ensure .env.local exists and restart 'npm run dev'."
  );
}

/** Validate Supabase env vars without throwing. */
export function checkSupabaseEnv(): SupabaseEnvStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missing: string[] = [];

  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!key) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length > 0 && typeof window === "undefined") {
    logMissingEnvOnce(missing);
  }

  return {
    ok: missing.length === 0,
    url,
    missing,
    hasServiceRole: Boolean(serviceRole),
  };
}

// Eager server-side validation on module load (API routes / server)
if (typeof window === "undefined") {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    console.error(
      "❌ CRITICAL: Supabase environment variables are missing on the server! Ensure .env.local exists and restart 'npm run dev'."
    );
  }
}

let ipv4Agent: Agent | null = null;

function getIpv4Agent(): Agent {
  if (!ipv4Agent) {
    ipv4Agent = new Agent({
      connect: { family: 4, timeout: 20_000 },
      headersTimeout: 30_000,
      bodyTimeout: 30_000,
      keepAliveTimeout: 10_000,
      keepAliveMaxTimeout: 15_000,
    });
  }
  return ipv4Agent;
}

/**
 * Server-only fetch bound to IPv4.
 * Fixes Windows Node.js native fetch hanging on IPv6 DNS for Supabase hosts.
 */
export const serverSupabaseFetch = ((
  input: RequestInfo | URL,
  init?: RequestInit
) =>
  undiciFetch(input as never, {
    ...(init as object),
    dispatcher: getIpv4Agent(),
  } as never)) as unknown as typeof fetch;

function buildClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: "public",
    },
    global: {
      fetch: serverSupabaseFetch,
    },
  });
}

/**
 * Server Supabase client for API routes / server libs.
 * Prefers SUPABASE_SERVICE_ROLE_KEY so RLS does not block trusted server writes
 * after requireGoogleAuth(). Never expose the service role to the browser.
 */
export function getSupabase(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error(
      "getSupabase() is server-only. Call SmartDoc APIs instead of querying Supabase from the browser."
    );
  }

  const status = checkSupabaseEnv();
  if (!status.ok) {
    logMissingEnvOnce(status.missing);
    throw new Error(`Supabase לא מוגדר: חסרים ${status.missing.join(", ")}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (serviceRole) {
    if (!adminClient) {
      adminClient = buildClient(url, serviceRole);
    }
    return adminClient;
  }

  if (!serviceRoleWarningLogged) {
    serviceRoleWarningLogged = true;
    console.warn(
      "[supabase] SUPABASE_SERVICE_ROLE_KEY missing — using anon key. " +
        "After enabling RLS, API routes will fail until the service role key is set in .env.local / Vercel."
    );
  }

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
  if (!client) {
    client = buildClient(url, anon);
  }
  return client;
}

/** Singleton export for API routes (lazy-initialized on first use). */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getSupabase(), prop);
  },
});

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
    if (
      lower.includes("certificate") ||
      lower.includes("unable to verify") ||
      lower.includes("unable_to_verify")
    ) {
      return "שגיאת אישור SSL בחיבור ל-Supabase. ב-Windows הריצו: npm run dev (כולל --use-system-ca) או הגדירו NODE_OPTIONS=--use-system-ca.";
    }
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
    return "אין הרשאה לטבלה (RLS). ודאו ש-SUPABASE_SERVICE_ROLE_KEY מוגדר בשרת ושמשתמש Google מחובר.";
  }
  if (lower.includes("jwt") || lower.includes("invalid api key")) {
    return "מפתח Supabase לא תקין. בדקו NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.";
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "כלל תיוק זה כבר קיים עבור הספק.";
  }

  return `שגיאת Supabase: ${raw}`;
}
