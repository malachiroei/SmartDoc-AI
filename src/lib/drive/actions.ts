import type { ExportFormat, ScannedPage } from "@/lib/types";
import { exportPages } from "@/lib/image/export";
import { fetchJsonOk } from "@/lib/api/client-fetch";
import { he } from "@/lib/i18n/he";

export async function uploadPagesToDrive(opts: {
  pages: ScannedPage[];
  format: ExportFormat;
  folderId: string;
  fileBase: string;
}): Promise<{ id: string; name: string; demo?: boolean }> {
  const { blob, filename, mimeType } = await exportPages(
    opts.pages,
    opts.format,
    opts.fileBase
  );

  const form = new FormData();
  form.append("file", blob, filename);
  form.append("folderId", opts.folderId);
  form.append("fileName", filename);
  form.append("mimeType", mimeType);

  return fetchJsonOk<{ id: string; name: string; demo?: boolean }>(
    "/api/drive/upload",
    { method: "POST", body: form, networkError: he.actions.uploadFailed }
  );
}

export async function createDriveFolder(name: string, parentId = "root") {
  return fetchJsonOk<{ id: string; name: string; path?: string; demo?: boolean }>(
    "/api/drive/create-folder",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
      networkError: he.toasts.filingFailed,
    }
  );
}

export async function upsertRoutingRule(opts: {
  vendor_or_doc_type: string;
  target_folder_id: string;
  target_folder_name: string;
}) {
  return fetchJsonOk<{
    rule: unknown;
    learned: boolean;
    confirmation_count: number;
  }>("/api/rules/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    networkError: he.toasts.ruleSaveFailed,
  });
}

export function makeScanFileBase() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `SmartDoc-${stamp}`;
}
