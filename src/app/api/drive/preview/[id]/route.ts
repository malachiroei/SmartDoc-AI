import { NextResponse } from "next/server";
import { requireGoogleAuth } from "@/lib/auth/require-google";
import { getAuthenticatedDrive } from "@/lib/google/drive-client";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/drive/preview/[id]
 * Streams a Drive file for in-app preview (PDF/image) using the user's Google session.
 */
export async function GET(_request: Request, context: Ctx) {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const fileId = id?.trim();
  if (!fileId || fileId.startsWith("demo-")) {
    return NextResponse.json({ error: "קובץ לא זמין לתצוגה" }, { status: 404 });
  }

  try {
    const auth = await getAuthenticatedDrive();
    if (!auth) {
      return NextResponse.json(
        { error: "נדרש חיבור Google", authUrl: "/api/auth/google" },
        { status: 401 }
      );
    }

    const meta = await auth.drive.files.get({
      fileId,
      fields: "id,name,mimeType",
    });

    const mime = meta.data.mimeType || "application/octet-stream";
    const name = meta.data.name || "document";

    const media = await auth.drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const buffer = Buffer.from(media.data as ArrayBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=120",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("[drive/preview]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? `תצוגה מקדימה נכשלה: ${e.message}` : "תצוגה נכשלה",
      },
      { status: 500 }
    );
  }
}
