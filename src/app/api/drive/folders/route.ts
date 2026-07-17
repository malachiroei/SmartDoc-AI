import { NextResponse } from "next/server";
import { getAuthenticatedDrive } from "@/lib/google/drive-client";
import { ensureSmartDocArchive } from "@/lib/drive/server";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { SMARTDOC_ARCHIVE_FOLDER } from "@/lib/google/constants";

/**
 * GET /api/drive/folders
 * Lists Drive folders for the authenticated session (or demo list).
 */
export async function GET() {
  const auth = await getAuthenticatedDrive();

  if (!auth) {
    if (isGoogleOAuthConfigured()) {
      return NextResponse.json(
        {
          error: "Not authenticated with Google Drive",
          authUrl: "/api/auth/google",
          folders: [],
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      demo: true,
      folders: [
        { id: "root", name: "My Drive", path: "/My Drive" },
        {
          id: "demo-archive",
          name: SMARTDOC_ARCHIVE_FOLDER,
          path: `/My Drive/${SMARTDOC_ARCHIVE_FOLDER}`,
        },
        {
          id: "demo-1",
          name: "SmartDoc Scans",
          path: "/My Drive/SmartDoc Scans",
        },
        {
          id: "demo-2",
          name: "Invoices 2026",
          path: "/My Drive/Invoices 2026",
        },
      ],
    });
  }

  try {
    const archive = await ensureSmartDocArchive(auth.drive);
    const res = await auth.drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id,name,parents)",
      pageSize: 50,
      spaces: "drive",
    });

    const folders = [
      {
        id: archive.id,
        name: archive.name,
        path: `/My Drive/${archive.name}`,
      },
      ...(res.data.files ?? [])
        .filter((f) => f.id && f.id !== archive.id)
        .map((f) => ({
          id: f.id!,
          name: f.name ?? "Folder",
          path: `/My Drive/${f.name ?? "Folder"}`,
        })),
    ];

    return NextResponse.json({ demo: false, folders });
  } catch (e) {
    console.error("[drive/folders]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list folders" },
      { status: 500 }
    );
  }
}
