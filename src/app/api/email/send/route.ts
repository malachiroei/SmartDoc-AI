import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { sendViaGmailApi } from "@/lib/gmail/send";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const to = String(form.get("to") ?? "");
  const subject = String(form.get("subject") ?? "Scanned document");
  const body = String(form.get("body") ?? "");
  const mimeType = String(form.get("mimeType") ?? "application/pdf");
  const fileName = file instanceof File ? file.name : "scan.pdf";

  if (!to || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "נדרשים נמען וקובץ מצורף" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 1) Prefer Gmail API when user is connected via Google OAuth
  const gmail = await sendViaGmailApi({
    to,
    subject,
    body,
    fileName,
    mimeType,
    fileBuffer: buffer,
  });

  if (gmail.ok) {
    return NextResponse.json({
      ok: true,
      to,
      subject,
      via: "gmail",
      messageId: gmail.id,
      demo: false,
    });
  }

  // 2) Fallback: SMTP if configured on the server
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !user || !pass) {
    const needsReconnect =
      gmail.reason.startsWith("gmail_scope") ||
      gmail.reason === "no_google_token";

    return NextResponse.json(
      {
        error: needsReconnect
          ? "שליחת מייל דורשת חיבור Google (עם הרשאת שליחה). לחצו «חיבור Google Drive» מחדש ואשרו את ההרשאות, או הגדירו SMTP_HOST / SMTP_USER / SMTP_PASS ב-Vercel."
          : `שליחת מייל נכשלה דרך Gmail (${gmail.reason}). אפשר גם להגדיר SMTP ב-Vercel.`,
        demo: true,
        configured: false,
        gmailReason: gmail.reason,
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

    return NextResponse.json({
      ok: true,
      to,
      subject,
      via: "smtp",
      demo: false,
    });
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
