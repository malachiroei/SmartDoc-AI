/** Shared Google Drive / OAuth constants */

export const SMARTDOC_ARCHIVE_FOLDER = "SmartDoc_Archive";

/** CamScanner (or any scanner) drops new scans here for SmartDoc to pull */
export const SMARTDOC_INBOX_FOLDER = "SmartDoc_Inbox";

/**
 * Full Drive scope is required so we can read files CamScanner creates
 * inside SmartDoc_Inbox (drive.file alone cannot see those).
 * Users must re-connect Google after this scope change.
 */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export const GOOGLE_TOKEN_COOKIE = "smartdoc_google_tokens";
