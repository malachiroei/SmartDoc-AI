import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const to = String(form.get("to") ?? "");
  const subject = String(form.get("subject") ?? "Scanned document");
  const body = String(form.get("body") ?? "");
  const mimeType = String(form.get("mimeType") ?? "application/pdf");
  const fileName =
    file instanceof File ? file.name : "scan.pdf";

  if (!to || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Recipient and file are required" },
      { status: 400 }
    );
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !user || !pass) {
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json({
      ok: true,
      demo: true,
      message: `Demo send to ${to}. Configure SMTP_* env vars for real email.`,
      to,
      subject,
      fileName,
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    await transporter.sendMail({
      from,
      to,
      subject,
      text: body,
      attachments: [
        {
          filename: fileName,
          content: buffer,
          contentType: mimeType,
        },
      ],
    });

    return NextResponse.json({ ok: true, to, subject });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Send failed" },
      { status: 500 }
    );
  }
}
