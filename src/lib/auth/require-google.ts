import { NextResponse } from "next/server";
import { getAuthenticatedDrive } from "@/lib/google/drive-client";
import { he } from "@/lib/i18n/he";

export type GoogleAuthOk = {
  ok: true;
  source: "session" | "env";
};

export type GoogleAuthFail = {
  ok: false;
  response: NextResponse;
};

/**
 * Require an authenticated Google session (cookie OAuth or server env tokens).
 * Use at the top of sensitive API routes.
 */
export async function requireGoogleAuth(): Promise<GoogleAuthOk | GoogleAuthFail> {
  const auth = await getAuthenticatedDrive();
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: he.google.needAuth,
          authUrl: "/api/auth/google",
        },
        { status: 401 }
      ),
    };
  }
  return { ok: true, source: auth.source };
}

/**
 * Prevent open redirects after OAuth.
 * Only same-origin relative paths are allowed (single leading slash, not //).
 */
export function safeReturnPath(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (!raw) return fallback;
  const path = raw.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  if (path.includes("://")) return fallback;
  if (path.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(path)) return fallback;
  // Disallow protocol-relative and scheme-like tricks
  if (/^\/[a-z]+:/i.test(path)) return fallback;
  return path;
}
