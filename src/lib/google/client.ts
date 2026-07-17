export type GoogleAuthStatus = {
  configured: boolean;
  authenticated: boolean;
  source: "session" | "env" | null;
  hasCookieSession: boolean;
  authUrl: string;
};

export async function fetchGoogleAuthStatus(): Promise<GoogleAuthStatus> {
  const res = await fetch("/api/auth/google/status", { cache: "no-store" });
  if (!res.ok) {
    return {
      configured: false,
      authenticated: false,
      source: null,
      hasCookieSession: false,
      authUrl: "/api/auth/google",
    };
  }
  return (await res.json()) as GoogleAuthStatus;
}

/** Starts OAuth by navigating to the API route (Google consent screen). */
export function startGoogleOAuth(returnTo?: string) {
  const path = returnTo || window.location.pathname || "/";
  const url = `/api/auth/google?returnTo=${encodeURIComponent(path)}`;
  window.location.href = url;
}

export async function disconnectGoogle(): Promise<void> {
  await fetch("/api/auth/google/status", { method: "DELETE" });
}
