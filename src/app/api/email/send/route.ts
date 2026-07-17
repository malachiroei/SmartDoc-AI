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
      { error: "נדרשים נמען וקובץ מצורף" },
      { status: 400 }
    );
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  // Never pretend email was sent — demo mode caused false "success" in production
  if (!host || !user || !pass) {
    return NextResponse.json(
      {
        error:
          "שליחת מייל לא מוגדרת בשרת. הוסיפו ב-Vercel: SMTP_HOST, SMTP_USER, SMTP_PASS (ואופציונלי SMTP_FROM).",
        demo: true,
        configured: false,
      },
      { status: 503 }
    );
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

    return NextResponse.json({ ok: true, to, subject, demo: false });
  } catch (e) {
    console.error("[email/send]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? `שליחת המייל נכשלה: ${e.message}`
            : "שליחת המייל נכשלה",
      },
      { status: 500 }
    );
  }
}
