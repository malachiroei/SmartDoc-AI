import { NextResponse } from "next/server";

/**
 * Lists Google Drive folders.
 * When GOOGLE_ACCESS_TOKEN is set, calls the real Drive API.
 * Otherwise returns demo folders so the UI can be developed offline.
 */
export async function GET() {
  const token = process.env.GOOGLE_ACCESS_TOKEN;

  if (token) {
    try {
      const res = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.folder%27%20and%20trashed%3Dfalse&fields=files(id%2Cname%2Cparents)&pageSize=50",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json(
          { error: `Drive API error: ${err}` },
          { status: res.status }
        );
      }
      const data = await res.json();
      const folders = [
        { id: "root", name: "My Drive (root)", path: "/My Drive" },
        ...(data.files ?? []).map(
          (f: { id: string; name: string }) => ({
            id: f.id,
            name: f.name,
            path: `/My Drive/${f.name}`,
          })
        ),
      ];
      return NextResponse.json({ folders });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Drive error" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    folders: [
      { id: "root", name: "My Drive (root)", path: "/My Drive" },
      {
        id: "demo-scans",
        name: "SmartDoc Scans",
        path: "/My Drive/SmartDoc Scans",
      },
      {
        id: "demo-receipts",
        name: "Receipts",
        path: "/My Drive/Receipts",
      },
      {
        id: "demo-invoices",
        name: "Invoices",
        path: "/My Drive/Invoices",
      },
    ],
    demo: true,
  });
}
