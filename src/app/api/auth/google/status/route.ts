import { NextResponse } from "next/server";
import { getAuthenticatedDrive } from "@/lib/google/drive-client";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { clearGoogleSession, readGoogleSession } from "@/lib/google/session";

export const runtime = "nodejs";

/** GET /api/auth/google/status — is Drive authenticated? */
export async function GET() {
  const session = await readGoogleSession();
  const auth = await getAuthenticatedDrive();
  return NextResponse.json({
    configured: isGoogleOAuthConfigured(),
    authenticated: Boolean(auth),
    source: auth?.source ?? null,
    hasCookieSession: Boolean(session),
    authUrl: "/api/auth/google",
  });
}

/** DELETE /api/auth/google/status — clear cookie session */
export async function DELETE() {
  await clearGoogleSession();
  return NextResponse.json({ ok: true });
}
