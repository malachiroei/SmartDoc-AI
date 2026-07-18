import type { ClassificationResult } from "@/lib/types";

/** Normalize / validate payload before sending to Gemini Vision */
export function prepareVisionPayload(dataUrl: string): {
  mime: string;
  base64: string;
  byteLength: number;
} {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]+)$/);
  let mime = (match?.[1] || "image/jpeg").trim().toLowerCase();
  let base64 = (match?.[2] || dataUrl.replace(/^data:.*?;base64,/, "")).replace(
    /\s/g,
    ""
  );

  if (!base64 || base64.length < 32) {
    throw new Error("התמונה ריקה או פגומה — נסו לצלם / להעלות שוב");
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    throw new Error("התמונה אינה מקודדת כראוי (base64)");
  }

  if (bytes.length < 64) {
    throw new Error("התמונה קטנה מדי לסיווג — נסו לצלם שוב");
  }

  // Detect real type from magic bytes (fixes wrong mime from Gmail / HEIC labeled as jpeg)
  const detected = sniffMime(bytes);
  if (detected) mime = detected;

  if (mime === "image/jpg") mime = "image/jpeg";

  // Gemini accepts PDF + common image types
  const ok =
    mime === "application/pdf" ||
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif";

  if (mime === "image/heic" || mime === "image/heif") {
    throw new Error(
      "פורמט HEIC לא נתמך לסיווג. בצילום מהטלפון בחרו JPG, או המירו את התמונה ל-JPEG לפני השליחה."
    );
  }

  if (!ok) {
    // Last resort: treat as jpeg (many cameras mislabel)
    mime = "image/jpeg";
  }

  // Soft size guard — very large payloads often cause INVALID_ARGUMENT
  if (bytes.length > 12 * 1024 * 1024) {
    throw new Error(
      "הקובץ גדול מדי לסיווג AI (מעל 12MB). העלו JPG/PDF קטן יותר."
    );
  }

  return { mime, base64, byteLength: bytes.length };
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 4 && bytes.toString("ascii", 0, 4) === "%PDF") {
    return "application/pdf";
  }
  if (bytes.length >= 6 && bytes.toString("ascii", 0, 3) === "GIF") {
    return "image/gif";
  }
  // HEIC/HEIF — Gemini often rejects these when mislabeled as JPEG
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 4, 8) === "ftyp" &&
    /heic|heif|mif1|msf1/i.test(bytes.toString("ascii", 8, 16))
  ) {
    return "image/heic";
  }
  return null;
}

/** Synthetic classify result when we cannot call Vision (demo / invalid) */
export function syntheticInvoiceResult(): ClassificationResult {
  return {
    doc_type: "Invoice",
    vendor: "Demo_Invoice_Unverified",
    suggested_folder_name: "חשבוניות דמו 2026",
    summary: "חשבונית דמו",
    confidence: 0.5,
    is_unpaid_bill: true,
    amount: 100,
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    is_personal_doc: false,
    tags: ["דמו"],
  };
}
