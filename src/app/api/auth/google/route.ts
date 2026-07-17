import { NextResponse } from "next/server";
import { getAuthUrl, getOAuthRedirectUri } from "@/lib/google/oauth";

export const runtime = "nodejs";

/**
 * GET /api/auth/google
 * Starts Google OAuth consent for Drive uploads.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const redirectUri = getOAuthRedirectUri(request.url);
    const returnTo = url.searchParams.get("returnTo") || "/";
    const state = Buffer.from(JSON.stringify({ returnTo }), "utf8").toString(
      "base64url"
    );
    const authUrl = getAuthUrl(redirectUri, state);
    return NextResponse.redirect(authUrl);
  } catch (e) {
    console.error("[auth/google]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
      },
      { status: 500 }
    );
  }
}
