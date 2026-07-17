import { createOAuth2Client, isGoogleOAuthConfigured } from "@/lib/google/oauth";
import {
  readEnvGoogleCredentials,
  readGoogleSession,
  writeGoogleSession,
} from "@/lib/google/session";
import { getAuthenticatedDrive } from "@/lib/google/drive-client";

/** Sync env-only token (legacy) */
export function getGoogleAccessToken(): string | null {
  return (
    process.env.GOOGLE_ACCESS_TOKEN?.trim() ||
    process.env.GMAIL_ACCESS_TOKEN?.trim() ||
    null
  );
}

/** Access token from cookie session, refresh token, or env — for Gmail/Drive REST */
export async function resolveGoogleBearerToken(): Promise<string | null> {
  const cookieSession = await readGoogleSession();
  const session = cookieSession ?? readEnvGoogleCredentials();

  if (session && isGoogleOAuthConfigured() && session.refresh_token) {
    try {
      const auth = createOAuth2Client();
      auth.setCredentials({
        access_token: session.access_token || undefined,
        refresh_token: session.refresh_token,
        expiry_date: session.expiry_date ?? undefined,
      });
      const needsRefresh =
        !session.access_token ||
        (session.expiry_date != null &&
          session.expiry_date < Date.now() + 60_000);
      if (needsRefresh) {
        const { credentials } = await auth.refreshAccessToken();
        if (cookieSession) await writeGoogleSession(credentials);
        return credentials.access_token ?? null;
      }
      if (session.access_token) return session.access_token;
    } catch (e) {
      console.warn("[google/token] refresh failed:", e);
    }
  }

  if (session?.access_token) return session.access_token;
  return getGoogleAccessToken();
}

export async function hasGoogleDriveAccess(): Promise<boolean> {
  return Boolean(await getAuthenticatedDrive());
}
