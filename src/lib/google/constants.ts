/** Shared Google Drive / OAuth constants */

export const SMARTDOC_ARCHIVE_FOLDER = "SmartDoc_Archive";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

export const GOOGLE_TOKEN_COOKIE = "smartdoc_google_tokens";
