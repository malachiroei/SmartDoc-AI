/** Google OAuth access token for Drive + Gmail APIs */
export function getGoogleAccessToken(): string | null {
  return (
    process.env.GOOGLE_ACCESS_TOKEN?.trim() ||
    process.env.GMAIL_ACCESS_TOKEN?.trim() ||
    null
  );
}
