import { NextResponse } from "next/server";
import { createOAuth2Client, getOAuthRedirectUri } from "@/lib/google/oauth";
import { writeGoogleSession } from "@/lib/google/session";
import { safeReturnPath } from "@/lib/auth/require-google";

export const runtime = "nodejs";

/**
 * GET /api/auth/google/callback
 * Exchanges OAuth code and stores tokens in an httpOnly cookie session.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const err = url.searchParams.get("error");

    let returnTo = "/";
    if (stateRaw) {
      try {
        const state = JSON.parse(
          Buffer.from(stateRaw, "base64url").toString("utf8")
        ) as { returnTo?: string };
        returnTo = safeReturnPath(state.returnTo, "/");
      } catch {
        /* ignore bad state */
      }
    }

    if (err) {
      return NextResponse.redirect(
        new URL(`${returnTo}?google_error=${encodeURIComponent(err)}`, url.origin)
      );
    }

    if (!code) {
      return NextResponse.json({ error: "Missing OAuth code" }, { status: 400 });
    }

    const redirectUri = getOAuthRedirectUri(request.url);
    const client = createOAuth2Client(redirectUri);
    const { tokens } = await client.getToken(code);
    await writeGoogleSession(tokens);

    return NextResponse.redirect(
      new URL(`${returnTo}?google_connected=1`, url.origin)
    );
  } catch (e) {
    console.error("[auth/google/callback]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "OAuth callback failed" },
      { status: 500 }
    );
  }
}
