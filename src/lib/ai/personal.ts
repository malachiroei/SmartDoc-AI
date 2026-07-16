import type { ClassificationResult, DocType } from "@/lib/types";
import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";

const PERSONAL_DOC_TYPES = new Set([
  "ID",
  "ID_Card",
  "Passport",
  "Driver_License",
  "Car_License",
  "Insurance",
  "Certificate",
]);

export const INVOICE_LEAK =
  /חשבונית|invoice|receipt|קבלה|bill|חשבון|דמו_vendor|demo_vendor|demo_invoice|נתוני דמו/i;

export function isPersonalDocType(docType: string | undefined): boolean {
  return !!docType && PERSONAL_DOC_TYPES.has(docType);
}

export function personalVaultDemoResult(
  hint?: string | null
): ClassificationResult {
  const h = (hint || "").toLowerCase();
  let doc_type: DocType = "Driver_License";
  let summary = "רישיון נהיגה ישראלי בתוקף";
  let tags = ["רישיון", "נהיגה", "תעודה"];

  if (/passport|דרכון/.test(h)) {
    doc_type = "Passport";
    summary = "דרכון ישראלי בתוקף";
    tags = ["דרכון", "זהות", "טיסות"];
  } else if (/id|זהות|תעודת/.test(h) && !/license|רישיון|driver|נהיגה/.test(h)) {
    doc_type = "ID_Card";
    summary = "תעודת זהות ישראלית";
    tags = ["תעודה", "זהות"];
  } else if (/car|vehicle|רכב/.test(h)) {
    doc_type = "Car_License";
    summary = "רישיון רכב ישראלי";
    tags = ["רכב", "רישיון"];
  } else if (/insurance|ביטוח/.test(h)) {
    doc_type = "Insurance";
    summary = "פוליסת ביטוח";
    tags = ["ביטוח", "תעודה"];
  } else if (/certificate|תעודה/.test(h) && !/זהות/.test(h)) {
    doc_type = "Certificate";
    summary = "תעודה אישית";
    tags = ["תעודה"];
  }

  return {
    doc_type,
    vendor: "State_of_Israel",
    suggested_folder_name: PERSONAL_VAULT_FOLDER_HE,
    summary,
    confidence: 0.99,
    is_personal_doc: true,
    is_unpaid_bill: false,
    amount: null,
    due_date: null,
    document_number: "053088654",
    expiration_date: "2032-01-01",
    tags,
  };
}

type SanitizeOpts = {
  /** When false (live Gemini/OCR), do not invent demo ID numbers/dates */
  fillDefaults?: boolean;
};

/** Clean personal-doc payload — strip invoice leaks; preserve real OCR when present */
export function sanitizePersonalClassification(
  input: Partial<ClassificationResult> & { doc_type?: string },
  hint?: string | null,
  opts?: SanitizeOpts
): ClassificationResult {
  const fillDefaults = opts?.fillDefaults !== false;
  const base = personalVaultDemoResult(hint || input.summary || input.doc_type);
  const docType = PERSONAL_DOC_TYPES.has(String(input.doc_type))
    ? (input.doc_type as DocType)
    : base.doc_type;

  let summary = String(input.summary || "").trim();
  const typed = personalVaultDemoResult(docType);
  if (!summary || INVOICE_LEAK.test(summary)) {
    summary = typed.summary;
  }

  const rawNum = input.document_number
    ? String(input.document_number).trim()
    : "";
  const rawExp = input.expiration_date
    ? String(input.expiration_date).slice(0, 10)
    : "";

  return {
    doc_type: docType === "ID" ? "ID_Card" : docType,
    vendor:
      !input.vendor || INVOICE_LEAK.test(input.vendor)
        ? "State_of_Israel"
        : String(input.vendor).replace(/\s+/g, "_"),
    suggested_folder_name: PERSONAL_VAULT_FOLDER_HE,
    summary,
    confidence: Math.max(0.9, Number(input.confidence) || 0.99),
    is_personal_doc: true,
    is_unpaid_bill: false,
    amount: null,
    due_date: null,
    document_number: rawNum
      ? rawNum
      : fillDefaults
        ? base.document_number
        : null,
    expiration_date: rawExp
      ? rawExp
      : fillDefaults
        ? base.expiration_date
        : null,
    tags:
      Array.isArray(input.tags) && input.tags.length > 0
        ? input.tags.map(String)
        : typed.tags,
  };
}

export const VAULT_TITLE_BY_TYPE: Record<string, string> = {
  Driver_License: "רישיון נהיגה - מדינת ישראל",
  Passport: "דרכון - מדינת ישראל",
  ID_Card: "תעודת זהות - מדינת ישראל",
  ID: "תעודת זהות - מדינת ישראל",
  Car_License: "רישיון רכב - מדינת ישראל",
  Insurance: "ביטוח - מסמך אישי",
  Certificate: "תעודה אישית",
};
