import { NextResponse } from "next/server";
import { uploadBufferToDrive } from "@/lib/drive/server";
import { getAuthenticatedDrive } from "@/lib/google/drive-client";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { SMARTDOC_ARCHIVE_FOLDER } from "@/lib/google/constants";
import { requireGoogleAuth } from "@/lib/auth/require-google";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/drive/upload
 * Uploads PDF/JPG to Google Drive (SmartDoc_Archive by default).
 * Requires an authenticated Google session or env tokens.
 */
export async function POST(request: Request) {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const folderId = String(form.get("folderId") ?? "root");
    const fileName = String(form.get("fileName") ?? "scan.pdf");
    const mimeType = String(form.get("mimeType") ?? "application/pdf");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // Auth check — prefer live session / env credentials
    const auth = await getAuthenticatedDrive();
    if (!auth && isGoogleOAuthConfigured()) {
      return NextResponse.json(
        {
          error: "Not authenticated with Google Drive",
          authUrl: "/api/auth/google",
          message: "Connect Google Drive first, then retry the upload.",
        },
        { status: 401 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadBufferToDrive({
      buffer,
      fileName,
      mimeType,
      folderId,
    });

    if (!result.webViewLink || result.webViewLink.startsWith("data:")) {
      return NextResponse.json(
        { error: "Upload succeeded but no Drive webViewLink was returned" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      id: result.id,
      name: result.name,
      webViewLink: result.webViewLink,
      folderId: result.folderId,
      archiveFolder: SMARTDOC_ARCHIVE_FOLDER,
      demo: Boolean(result.demo),
    });
  } catch (e) {
    const status =
      e instanceof Error && "status" in e
        ? Number((e as Error & { status?: number }).status) || 500
        : 500;
    console.error("[drive/upload]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Upload failed",
        authUrl: status === 401 ? "/api/auth/google" : undefined,
      },
      { status }
    );
  }
}
