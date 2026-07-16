import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const folderId = String(form.get("folderId") ?? "root");
  const fileName = String(form.get("fileName") ?? "scan.pdf");
  const mimeType = String(form.get("mimeType") ?? "application/pdf");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const token = process.env.GOOGLE_ACCESS_TOKEN;

  if (!token) {
    // Demo mode — acknowledge upload without calling Google
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({
      id: `demo-${Date.now()}`,
      name: fileName,
      folderId,
      demo: true,
      message:
        "Demo upload OK. Set GOOGLE_ACCESS_TOKEN to enable real Drive uploads.",
    });
  }

  try {
    const metadata = {
      name: fileName,
      parents: folderId === "root" ? undefined : [folderId],
    };

    const boundary = "smartdoc_boundary";
    const buffer = Buffer.from(await file.arrayBuffer());
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
      ),
      buffer,
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
      return NextResponse.json(
        { error: data.error?.message ?? "Drive upload failed" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
