import { google } from "googleapis";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/google/constants";

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export function getOAuthRedirectUri(requestUrl?: string): string {
  if (process.env.GOOGLE_REDIRECT_URI?.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/auth/google/callback`;
  }
  if (requestUrl) {
    const origin = new URL(requestUrl).origin;
    return `${origin}/api/auth/google/callback`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/auth/google/callback`;
  }
  return "http://localhost:3000/api/auth/google/callback";
}

export function createOAuth2Client(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured");
  }
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri ?? getOAuthRedirectUri()
  );
}

export function getAuthUrl(redirectUri: string, state?: string): string {
  const client = createOAuth2Client(redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_OAUTH_SCOPES],
    state,
  });
}
