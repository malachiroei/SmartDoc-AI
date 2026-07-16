import type { ExportFormat, ScannedPage } from "@/lib/types";
import { exportPages } from "@/lib/image/export";

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

  const res = await fetch("/api/drive/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data;
}

export async function createDriveFolder(name: string, parentId = "root") {
  const res = await fetch("/api/drive/create-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Create folder failed");
  return data as { id: string; name: string; path?: string; demo?: boolean };
}

export async function upsertRoutingRule(opts: {
  vendor_or_doc_type: string;
  target_folder_id: string;
  target_folder_name: string;
}) {
  const res = await fetch("/api/rules/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Rule upsert failed");
  return data as {
    rule: unknown;
    learned: boolean;
    confirmation_count: number;
  };
}

export function makeScanFileBase() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `SmartDoc-${stamp}`;
}
