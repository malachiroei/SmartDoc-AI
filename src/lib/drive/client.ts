import { fetchJsonOk } from "@/lib/api/client-fetch";
import { he } from "@/lib/i18n/he";

export async function ingestDriveInbox(): Promise<{
  processed: Array<{
    fileName: string;
    vendor: string;
    doc_type: string;
    folder?: string;
    billAlert?: boolean;
    pending?: boolean;
    autonomous?: boolean;
  }>;
  notifications: string[];
  demo: boolean;
  scanned: number;
  pendingCount: number;
  inboxFolder: string;
}> {
  return fetchJsonOk("/api/drive/inbox/ingest", {
    method: "POST",
    networkError: he.driveInbox.ingestError,
  });
}
