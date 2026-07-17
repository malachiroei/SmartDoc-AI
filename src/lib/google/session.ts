import { cookies } from "next/headers";
import type { Credentials } from "google-auth-library";
import { GOOGLE_TOKEN_COOKIE } from "@/lib/google/constants";

export type GoogleTokenSession = {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number | null;
};

function encodeSession(session: GoogleTokenSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

function decodeSession(raw: string | undefined): GoogleTokenSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8")
    ) as GoogleTokenSession;
    if (!parsed?.access_token && !parsed?.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function readGoogleSession(): Promise<GoogleTokenSession | null> {
  const jar = await cookies();
  return decodeSession(jar.get(GOOGLE_TOKEN_COOKIE)?.value);
}

export async function writeGoogleSession(
  credentials: Credentials
): Promise<void> {
  const jar = await cookies();
  const session: GoogleTokenSession = {
    access_token: credentials.access_token ?? "",
    refresh_token: credentials.refresh_token ?? undefined,
    expiry_date: credentials.expiry_date ?? null,
  };

  // Preserve existing refresh token if Google omits it on refresh
  if (!session.refresh_token) {
    const prev = await readGoogleSession();
    if (prev?.refresh_token) session.refresh_token = prev.refresh_token;
  }

  jar.set(GOOGLE_TOKEN_COOKIE, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });
}

export async function clearGoogleSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(GOOGLE_TOKEN_COOKIE);
}

/** Env-based long-lived credentials (server / Vercel) */
export function readEnvGoogleCredentials(): GoogleTokenSession | null {
  const refresh = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const access =
    process.env.GOOGLE_ACCESS_TOKEN?.trim() ||
    process.env.GMAIL_ACCESS_TOKEN?.trim();

  if (!refresh && !access) return null;
  return {
    access_token: access || "",
    refresh_token: refresh,
    expiry_date: null,
  };
}
