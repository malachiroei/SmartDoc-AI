import { createOAuth2Client, isGoogleOAuthConfigured } from "@/lib/google/oauth";
import {
  readEnvGoogleCredentials,
  readGoogleSession,
  writeGoogleSession,
} from "@/lib/google/session";
import { google, type drive_v3 } from "googleapis";

export type GoogleAuthResult = {
  drive: drive_v3.Drive;
  source: "session" | "env";
};

/**
 * Resolve an authenticated Google Drive client from:
 * 1) httpOnly OAuth cookie session
 * 2) GOOGLE_REFRESH_TOKEN / GOOGLE_ACCESS_TOKEN env
 */
export async function getAuthenticatedDrive(): Promise<GoogleAuthResult | null> {
  const cookieSession = await readGoogleSession();
  const session = cookieSession ?? readEnvGoogleCredentials();
  if (!session) return null;

  const source: "session" | "env" = cookieSession ? "session" : "env";

  try {
    if (isGoogleOAuthConfigured()) {
      const auth = createOAuth2Client();
      auth.setCredentials({
        access_token: session.access_token || undefined,
        refresh_token: session.refresh_token,
        expiry_date: session.expiry_date ?? undefined,
      });

      const needsRefresh =
        Boolean(session.refresh_token) &&
        (!session.access_token ||
          (session.expiry_date != null &&
            session.expiry_date < Date.now() + 60_000));

      if (needsRefresh) {
        const { credentials } = await auth.refreshAccessToken();
        auth.setCredentials(credentials);
        if (cookieSession) {
          await writeGoogleSession(credentials);
        }
      }

      return { drive: google.drive({ version: "v3", auth }), source };
    }

    if (session.access_token) {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: session.access_token });
      return { drive: google.drive({ version: "v3", auth }), source };
    }
  } catch (e) {
    console.warn("[google/auth] failed to build Drive client:", e);
    if (session.access_token) {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: session.access_token });
      return { drive: google.drive({ version: "v3", auth }), source };
    }
  }

  return null;
}

export async function requireDriveAuth(): Promise<GoogleAuthResult> {
  const auth = await getAuthenticatedDrive();
  if (!auth) {
    const err = new Error(
      isGoogleOAuthConfigured()
        ? "Not authenticated with Google Drive. Connect Google first."
        : "Google Drive is not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and connect, or GOOGLE_ACCESS_TOKEN)."
    );
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return auth;
}
