import { getGoogleAccessToken } from "@/lib/google/token";

export type DriveUploadResult = {
  id: string;
  name: string;
  webViewLink?: string;
  demo?: boolean;
};

export async function uploadBufferToDrive(opts: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folderId?: string;
}): Promise<DriveUploadResult> {
  const token = getGoogleAccessToken();
  const folderId = opts.folderId ?? "root";

  if (!token) {
    await new Promise((r) => setTimeout(r, 300));
    return {
      id: `demo-file-${Date.now()}`,
      name: opts.fileName,
      webViewLink: `https://drive.google.com/file/d/demo-${Date.now()}/view`,
      demo: true,
    };
  }

  const metadata: { name: string; parents?: string[] } = {
    name: opts.fileName,
  };
  if (folderId !== "root") {
    metadata.parents = [folderId];
  }

  const boundary = "smartdoc_boundary";
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`
    ),
    opts.buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2Cname%2CwebViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? "Drive upload failed");
  }

  return {
    id: data.id,
    name: data.name ?? opts.fileName,
    webViewLink: data.webViewLink,
  };
}

export async function ensureDriveFolder(
  name: string,
  parentId = "root"
): Promise<{ id: string; name: string }> {
  const token = getGoogleAccessToken();

  if (!token) {
    return { id: `demo-folder-${Date.now()}`, name };
  }

  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId !== "root") {
    metadata.parents = [parentId];
  }

  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id%2Cname", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message ?? "Failed to create folder");
  }

  return { id: data.id, name: data.name ?? name };
}
