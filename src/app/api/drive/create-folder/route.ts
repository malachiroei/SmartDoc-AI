import { NextResponse } from "next/server";
import { ensureDriveFolder } from "@/lib/drive/server";
import { getAuthenticatedDrive } from "@/lib/google/drive-client";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { requireGoogleAuth } from "@/lib/auth/require-google";

export const runtime = "nodejs";

/**
 * POST /api/drive/create-folder
 * Find-or-create a Drive folder (under SmartDoc_Archive when parent is root).
 */
export async function POST(request: Request) {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const parentId = body.parentId ? String(body.parentId) : "root";

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const auth = await getAuthenticatedDrive();
    if (!auth && isGoogleOAuthConfigured()) {
      return NextResponse.json(
        {
          error: "Not authenticated with Google Drive",
          authUrl: "/api/auth/google",
        },
        { status: 401 }
      );
    }

    const folder = await ensureDriveFolder(name, parentId);
    const demo = folder.id.startsWith("demo-");

    return NextResponse.json({
      id: folder.id,
      name: folder.name,
      path: `/My Drive/SmartDoc_Archive/${folder.name}`,
      demo,
    });
  } catch (e) {
    console.error("[drive/create-folder]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create folder failed" },
      { status: 500 }
    );
  }
}
