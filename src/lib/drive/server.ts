import { Readable } from "node:stream";
import type { drive_v3 } from "googleapis";
import { SMARTDOC_ARCHIVE_FOLDER, SMARTDOC_INBOX_FOLDER } from "@/lib/google/constants";
import {
  getAuthenticatedDrive,
  requireDriveAuth,
} from "@/lib/google/drive-client";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";

export type DriveUploadResult = {
  id: string;
  name: string;
  webViewLink?: string;
  folderId?: string;
  demo?: boolean;
};

export async function findFolderByName(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string
): Promise<{ id: string; name: string } | null> {
  const escaped = name.replace(/'/g, "\\'");
  let q = `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId && parentId !== "root") {
    q += ` and '${parentId}' in parents`;
  }

  const res = await drive.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 5,
    spaces: "drive",
  });

  const file = res.data.files?.[0];
  if (!file?.id) return null;
  return { id: file.id, name: file.name ?? name };
}

export async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId = "root"
): Promise<{ id: string; name: string }> {
  const existing = await findFolderByName(
    drive,
    name,
    parentId === "root" ? undefined : parentId
  );
  if (existing) return existing;

  const parents =
    parentId && parentId !== "root" ? [parentId] : undefined;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents,
    },
    fields: "id,name",
  });

  if (!created.data.id) {
    throw new Error(`Failed to create Drive folder: ${name}`);
  }

  return { id: created.data.id, name: created.data.name ?? name };
}

/** Ensure the dedicated SmartDoc_Archive folder exists */
export async function ensureSmartDocArchive(
  drive: drive_v3.Drive
): Promise<{ id: string; name: string }> {
  return findOrCreateFolder(drive, SMARTDOC_ARCHIVE_FOLDER, "root");
}

/**
 * Resolve upload parent:
 * - real folderId → use it
 * - root / missing / demo → SmartDoc_Archive
 */
export async function resolveUploadFolderId(
  drive: drive_v3.Drive,
  folderId?: string | null
): Promise<string> {
  const archive = await ensureSmartDocArchive(drive);
  if (
    !folderId ||
    folderId === "root" ||
    folderId.startsWith("demo-")
  ) {
    return archive.id;
  }
  return folderId;
}

export async function uploadBufferToDrive(opts: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folderId?: string;
}): Promise<DriveUploadResult> {
  const auth = await getAuthenticatedDrive();

  if (!auth) {
    if (isGoogleOAuthConfigured()) {
      const err = new Error(
        "Not authenticated with Google Drive. Visit /api/auth/google to connect."
      );
      (err as Error & { status?: number }).status = 401;
      throw err;
    }
    // Local/dev without credentials — demo stub
    await new Promise((r) => setTimeout(r, 300));
    const id = `demo-file-${Date.now()}`;
    return {
      id,
      name: opts.fileName,
      webViewLink: `https://drive.google.com/file/d/${id}/view`,
      folderId: opts.folderId ?? "root",
      demo: true,
    };
  }

  const { drive } = auth;
  const parentId = await resolveUploadFolderId(drive, opts.folderId);

  const created = await drive.files.create({
    requestBody: {
      name: opts.fileName,
      parents: [parentId],
    },
    media: {
      mimeType: opts.mimeType,
      body: Readable.from(opts.buffer),
    },
    fields: "id,name,webViewLink",
  });

  const id = created.data.id;
  if (!id) throw new Error("Drive upload returned no file id");

  let webViewLink = created.data.webViewLink ?? undefined;
  if (!webViewLink) {
    // Fetch metadata once more for webViewLink
    const meta = await drive.files.get({
      fileId: id,
      fields: "id,name,webViewLink",
    });
    webViewLink = meta.data.webViewLink ?? undefined;
  }

  if (!webViewLink) {
    webViewLink = `https://drive.google.com/file/d/${id}/view`;
  }

  return {
    id,
    name: created.data.name ?? opts.fileName,
    webViewLink,
    folderId: parentId,
    demo: false,
  };
}

export async function ensureDriveFolder(
  name: string,
  parentId = "root"
): Promise<{ id: string; name: string }> {
  const auth = await getAuthenticatedDrive();
  if (!auth) {
    return { id: `demo-folder-${Date.now()}`, name };
  }

  // Nest new folders under SmartDoc_Archive when parent is root
  let parent = parentId;
  if (!parentId || parentId === "root" || parentId.startsWith("demo-")) {
    const archive = await ensureSmartDocArchive(auth.drive);
    parent = archive.id;
  }

  return findOrCreateFolder(auth.drive, name, parent);
}

/** Move a Drive file into a new parent folder and optionally rename it. */
export async function moveAndRenameDriveFile(opts: {
  fileId: string;
  newName: string;
  newParentId: string;
}): Promise<DriveUploadResult> {
  const auth = await getAuthenticatedDrive();
  if (!auth) {
    return {
      id: opts.fileId,
      name: opts.newName,
      webViewLink: `https://drive.google.com/file/d/${opts.fileId}/view`,
      folderId: opts.newParentId,
      demo: true,
    };
  }

  if (opts.fileId.startsWith("demo-")) {
    return {
      id: opts.fileId,
      name: opts.newName,
      webViewLink: `https://drive.google.com/file/d/${opts.fileId}/view`,
      folderId: opts.newParentId,
      demo: true,
    };
  }

  const { drive } = auth;
  const parentId = await resolveUploadFolderId(drive, opts.newParentId);

  const meta = await drive.files.get({
    fileId: opts.fileId,
    fields: "id,name,parents,webViewLink",
  });

  const previousParents = (meta.data.parents ?? []).join(",");

  const updated = await drive.files.update({
    fileId: opts.fileId,
    addParents: parentId,
    removeParents: previousParents || undefined,
    requestBody: { name: opts.newName },
    fields: "id,name,webViewLink",
  });

  return {
    id: updated.data.id ?? opts.fileId,
    name: updated.data.name ?? opts.newName,
    webViewLink:
      updated.data.webViewLink ??
      `https://drive.google.com/file/d/${opts.fileId}/view`,
    folderId: parentId,
    demo: false,
  };
}

export async function trashDriveFile(fileId: string): Promise<void> {
  if (!fileId || fileId.startsWith("demo-")) return;
  const auth = await getAuthenticatedDrive();
  if (!auth) return;
  await auth.drive.files.update({
    fileId,
    requestBody: { trashed: true },
  });
}

/** Ensure root-level SmartDoc_Inbox exists (CamScanner target). */
export async function ensureSmartDocInbox(
  drive?: drive_v3.Drive
): Promise<{ id: string; name: string }> {
  if (drive) {
    return findOrCreateFolder(drive, SMARTDOC_INBOX_FOLDER, "root");
  }
  const auth = await getAuthenticatedDrive();
  if (!auth) {
    return { id: `demo-inbox-${Date.now()}`, name: SMARTDOC_INBOX_FOLDER };
  }
  return findOrCreateFolder(auth.drive, SMARTDOC_INBOX_FOLDER, "root");
}

export type DriveInboxFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: number;
};

/** List PDF/image files directly inside SmartDoc_Inbox (not nested). */
export async function listInboxFiles(): Promise<{
  folderId: string;
  files: DriveInboxFile[];
  demo?: boolean;
}> {
  const auth = await getAuthenticatedDrive();
  if (!auth) {
    return { folderId: "demo-inbox", files: [], demo: true };
  }

  const inbox = await findOrCreateFolder(
    auth.drive,
    SMARTDOC_INBOX_FOLDER,
    "root"
  );

  const res = await auth.drive.files.list({
    q: `'${inbox.id}' in parents and trashed=false and (mimeType='application/pdf' or mimeType contains 'image/')`,
    fields:
      "files(id,name,mimeType,webViewLink,modifiedTime,size)",
    pageSize: 40,
    orderBy: "modifiedTime desc",
    spaces: "drive",
  });

  const files: DriveInboxFile[] = (res.data.files ?? [])
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType ?? "application/octet-stream",
      webViewLink: f.webViewLink ?? undefined,
      modifiedTime: f.modifiedTime ?? undefined,
      size: f.size ? Number(f.size) : undefined,
    }));

  return { folderId: inbox.id, files };
}

/** Download file bytes from Drive. */
export async function downloadDriveFileBuffer(
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  const auth = await getAuthenticatedDrive();
  if (!auth || fileId.startsWith("demo-")) {
    return {
      buffer: Buffer.from(
        "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
      ),
      mimeType: "application/pdf",
      name: "demo.pdf",
    };
  }

  const meta = await auth.drive.files.get({
    fileId,
    fields: "id,name,mimeType",
  });

  const media = await auth.drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const data = media.data as ArrayBuffer;
  return {
    buffer: Buffer.from(data),
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    name: meta.data.name ?? fileId,
  };
}

export async function assertDriveAuthenticated(): Promise<boolean> {
  try {
    await requireDriveAuth();
    return true;
  } catch {
    return false;
  }
}
