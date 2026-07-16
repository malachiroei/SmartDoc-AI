import { NextResponse } from "next/server";

/**
 * POST /api/drive/create-folder
 * Creates a Drive folder (or demo folder when no token).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const parentId = body.parentId ? String(body.parentId) : "root";

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const token = process.env.GOOGLE_ACCESS_TOKEN;

    if (!token) {
      await new Promise((r) => setTimeout(r, 400));
      const id = `demo-folder-${Date.now()}`;
      return NextResponse.json({
        id,
        name,
        path: parentId === "root" ? `/My Drive/${name}` : `/My Drive/.../${name}`,
        demo: true,
      });
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
      return NextResponse.json(
        { error: data.error?.message ?? "Failed to create folder" },
        { status: res.status }
      );
    }

    return NextResponse.json({
      id: data.id,
      name: data.name ?? name,
      path: `/My Drive/${data.name ?? name}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create folder failed" },
      { status: 500 }
    );
  }
}
