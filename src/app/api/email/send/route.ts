import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { sendViaGmailApi } from "@/lib/gmail/send";
import { requireGoogleAuth } from "@/lib/auth/require-google";

export async function POST(request: Request) {
  const gate = await requireGoogleAuth();
  if (!gate.ok) return gate.response;

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
    let error: string;
    if (gmail.reason === "no_google_token") {
      error =
        "שליחת מייל דורשת חיבור Google. לחצו «חיבור Google Drive» ואשרו את ההרשאות.";
    } else if (gmail.reason.startsWith("gmail_api_disabled")) {
      error =
        "Gmail API כבוי בפרויקט Google Cloud. יש להפעיל אותו בקונסול: https://console.cloud.google.com/apis/library/gmail.googleapis.com — ואז להמתין כמה דקות ולנסות שוב.";
    } else if (gmail.reason.startsWith("gmail_scope")) {
      error =
        "חסרה הרשאת שליחת מייל ב-Google. לחצו «חיבור Google Drive» מחדש ואשרו את כל ההרשאות.";
    } else {
      error = `שליחת מייל נכשלה דרך Gmail. אפשר גם להגדיר SMTP_HOST / SMTP_USER / SMTP_PASS ב-Vercel.`;
    }

    // Log raw provider details server-side only — never send gmailReason to the client
    console.warn("[email/send] gmail fallback:", gmail.reason.slice(0, 300));

    return NextResponse.json(
      {
        error,
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
