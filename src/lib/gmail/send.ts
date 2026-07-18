import { resolveGoogleBearerToken } from "@/lib/google/token";

function encodeBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeHeaderUtf8(value: string): string {
  // RFC 2047 for non-ASCII subject / from display
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Build a simple multipart email with one attachment (RFC 2822). */
export function buildRawMimeMessage(opts: {
  to: string;
  from: string;
  subject: string;
  body: string;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
}): string {
  const boundary = `smartdoc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const subject = encodeHeaderUtf8(opts.subject);
  const textBody = opts.body || "";

  const lines = [
    `To: ${opts.to}`,
    `From: ${opts.from}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(textBody, "utf8").toString("base64"),
    "",
    `--${boundary}`,
    `Content-Type: ${opts.mimeType}; name="${opts.fileName.replace(/"/g, "")}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${opts.fileName.replace(/"/g, "")}"`,
    "",
    opts.fileBuffer.toString("base64"),
    "",
    `--${boundary}--`,
    "",
  ];

  return lines.join("\r\n");
}

export async function sendViaGmailApi(opts: {
  to: string;
  subject: string;
  body: string;
  fileName: string;
  mimeType: string;
  fileBuffer: Buffer;
}): Promise<{ ok: true; id?: string } | { ok: false; reason: string }> {
  const token = await resolveGoogleBearerToken();
  if (!token) {
    return { ok: false, reason: "no_google_token" };
  }

  const raw = buildRawMimeMessage({
    ...opts,
    from: "me",
  });

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodeBase64Url(Buffer.from(raw, "utf8")) }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    // Missing gmail.send scope after reconnect needed
    if (res.status === 403 || /insufficient|scope|PERMISSION/i.test(errText)) {
      return {
        ok: false,
        reason: `gmail_scope: ${errText.slice(0, 400)}`,
      };
    }
    return { ok: false, reason: `gmail_api: ${errText.slice(0, 500)}` };
  }

  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}
