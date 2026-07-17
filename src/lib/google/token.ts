import { getAuthenticatedDrive } from "@/lib/google/drive-client";

/** @deprecated Prefer getAuthenticatedDrive() — kept for Gmail/memory callers */
export function getGoogleAccessToken(): string | null {
  return (
    process.env.GOOGLE_ACCESS_TOKEN?.trim() ||
    process.env.GMAIL_ACCESS_TOKEN?.trim() ||
    null
  );
}

export async function hasGoogleDriveAccess(): Promise<boolean> {
  return Boolean(await getAuthenticatedDrive());
}
