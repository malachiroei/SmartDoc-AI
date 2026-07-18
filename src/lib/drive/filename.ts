import type { ClassificationResult } from "@/lib/types";
import { docTypeHe } from "@/lib/i18n/he";

/** Strip characters that break Drive / filesystem filenames */
export function sanitizeFileBase(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim()
    .slice(0, 120);
  return cleaned || "SmartDoc";
}

/**
 * Build a meaningful Drive file base name from AI classification.
 * Example: "חשבון מים - מרץ 2026" or "רישיון נהיגה - רועי מלאכי"
 */
export function makeScanFileBase(
  classification?: Partial<ClassificationResult> | null
): string {
  if (classification) {
    const summary = String(classification.summary || "").trim();
    if (
      summary &&
      summary.length >= 2 &&
      !/חשבונית דמו|demo_invoice|נתוני דמו/i.test(summary)
    ) {
      return sanitizeFileBase(summary);
    }

    const vendorRaw = String(classification.vendor || "").trim();
    const isWater =
      /mei_?avivim|אביבים|מים/i.test(vendorRaw) ||
      /מים|water/i.test(summary);

    if (isWater) {
      const paid = classification.doc_type === "Receipt" || !classification.is_unpaid_bill;
      return sanitizeFileBase(
        paid ? "אישור תשלום מים" : "חשבון מים"
      );
    }

    const typeLabel = docTypeHe(classification.doc_type || "Other");
    const vendorOk =
      vendorRaw &&
      !/^(Unknown|State_of_Israel|Demo_)/i.test(vendorRaw) &&
      !/דמו/i.test(vendorRaw);

    if (vendorOk) {
      return sanitizeFileBase(
        `${typeLabel} - ${vendorRaw.replace(/_/g, " ")}`
      );
    }

    if (classification.document_number) {
      return sanitizeFileBase(
        `${typeLabel} - ${classification.document_number}`
      );
    }

    return sanitizeFileBase(typeLabel);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `SmartDoc-${stamp}`;
}

/** Full filename with extension for Drive upload */
export function makeScanFileName(
  classification: Partial<ClassificationResult> | null | undefined,
  format: "pdf" | "jpg" | "jpeg" | "png"
): string {
  const ext = format === "jpeg" ? "jpg" : format;
  return `${makeScanFileBase(classification)}.${ext}`;
}
