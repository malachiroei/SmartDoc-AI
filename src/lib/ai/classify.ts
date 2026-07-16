import type { ClassificationResult, DocType } from "@/lib/types";
import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
import {
  applyFeedbackOverrides,
  formatFeedbackOverrides,
  formatFewShotBlock,
  loadClassificationMemory,
  type ClassificationMemory,
} from "@/lib/ai/memory";

export { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";

/** Detect personal ID / license / passport from filename or free-text hint */
export function looksLikePersonalDocument(
  ...hints: Array<string | null | undefined>
): boolean {
  const text = hints.filter(Boolean).join(" ").toLowerCase();
  if (!text) return false;
  return /license|driver|passport|id[_\s-]?card|\bid\b|identity|רישיון|תעודה|תעודת|דרכון|נהיגה|זהות|רכב/.test(
    text
  );
}

export function personalVaultDemoResult(
  hint?: string | null
): ClassificationResult {
  const h = (hint || "").toLowerCase();
  let doc_type: DocType = "Driver_License";
  let summary = "רישיון נהיגה - רועי מלאכי (נתוני דמו לכספת)";
  let tags = ["רישיון", "נהיגה", "זהות"];

  if (/passport|דרכון/.test(h)) {
    doc_type = "Passport";
    summary = "דרכון - רועי מלאכי (נתוני דמו לכספת)";
    tags = ["דרכון", "זהות", "טיסות"];
  } else if (/id|זהות|תעודת/.test(h) && !/license|רישיון|driver|נהיגה/.test(h)) {
    doc_type = "ID_Card";
    summary = "תעודת זהות - רועי מלאכי (נתוני דמו לכספת)";
    tags = ["תעודה", "זהות"];
  } else if (/car|vehicle|רכב/.test(h)) {
    doc_type = "Car_License";
    summary = "רישיון רכב (נתוני דמו לכספת)";
    tags = ["רכב", "רישיון"];
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
    expiration_date: "2026-01-01",
    tags,
  };
}

const BASE_SCHEMA = `Schema (STRICT JSON only — no markdown):
{
  "doc_type": "Invoice | Receipt | Bill | Contract | ID | ID_Card | Passport | Driver_License | Car_License | Insurance | Certificate | Other",
  "vendor": "String (e.g., 'Electra', 'State_of_Israel')",
  "suggested_folder_name": "String in HEBREW",
  "summary": "String in HEBREW (2-5 words)",
  "confidence": 0.98,
  "is_unpaid_bill": false,
  "amount": null,
  "due_date": null,
  "is_personal_doc": true,
  "document_number": "31245678",
  "expiration_date": "YYYY-MM-DD",
  "tags": ["דרכון", "זהות"]
}`;

const DOMAIN_RULES = `
CRITICAL DOMAIN RULES:
- If the document is an Israeli ID (תעודת זהות), Passport (דרכון), Driver's License (רישיון נהיגה), or Vehicle License (רישיון רכב / רכב), NEVER classify it as an Invoice, Bill, or Receipt. Set is_personal_doc=true and route strictly to folder "מסמכים אישיים" (Personal Vault).
- Prefer matching known vendors and folder names from the user's vocabulary below when possible — do NOT invent generic English folders when a Hebrew folder already exists.
- vendor: PascalCase or Underscore_Case Latin letters, no spaces.
- suggested_folder_name: MUST be Hebrew. Personal docs → exactly "מסמכים אישיים".
- is_unpaid_bill: true only for unpaid invoices/bills; false for receipts and personal docs.
- Prefer specific personal types (Passport, Driver_License, etc.) over generic "ID".
`;

export function buildAdaptiveSystemPrompt(memory: ClassificationMemory): string {
  const fewShot = formatFewShotBlock(memory.examples);
  const overrides = formatFeedbackOverrides(memory.feedbackOverrides);
  const vendors =
    memory.knownVendors.length > 0
      ? memory.knownVendors.join(", ")
      : "(none yet)";
  const folders =
    memory.knownFolders.length > 0
      ? memory.knownFolders.join(" · ")
      : PERSONAL_VAULT_FOLDER_HE;

  return `You are SmartDoc AI, a tailored document classification agent. You must learn and mimic the user's personal classification style based on their verified historical data below:

VERIFIED FEW-SHOT EXAMPLES (mimic this style):
${fewShot}
${overrides}
KNOWN VENDORS (prefer these spellings when matching):
${vendors}

EXISTING GOOGLE DRIVE FOLDERS (prefer these exact names when suggesting folders):
${folders}

${BASE_SCHEMA}
${DOMAIN_RULES}`;
}

/** Static fallback prompt (no memory) — kept for exports/tests */
export const SYSTEM_PROMPT = buildAdaptiveSystemPrompt({
  examples: [],
  knownVendors: [],
  knownFolders: [PERSONAL_VAULT_FOLDER_HE],
  feedbackOverrides: [],
});

const DOC_TYPES: DocType[] = [
  "Invoice",
  "Receipt",
  "Bill",
  "Contract",
  "ID",
  "ID_Card",
  "Passport",
  "Driver_License",
  "Car_License",
  "Insurance",
  "Certificate",
  "Other",
];

const PERSONAL_TYPES = new Set<DocType>([
  "ID",
  "ID_Card",
  "Passport",
  "Driver_License",
  "Car_License",
  "Insurance",
  "Certificate",
]);

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function parseClassificationJson(raw: string): ClassificationResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<ClassificationResult>;

  let docType = DOC_TYPES.includes(parsed.doc_type as DocType)
    ? (parsed.doc_type as DocType)
    : "Other";

  if (docType === "ID" && parsed.is_personal_doc !== false) {
    docType = "ID_Card";
  }

  const isPersonal =
    Boolean(parsed.is_personal_doc) || PERSONAL_TYPES.has(docType);

  const suggested = isPersonal
    ? PERSONAL_VAULT_FOLDER_HE
    : String(
        parsed.suggested_folder_name || `${parsed.vendor || "Documents"}`
      ).trim();

  return {
    doc_type: docType,
    vendor: String(parsed.vendor || "Unknown").replace(/\s+/g, "_"),
    suggested_folder_name: suggested,
    summary: String(parsed.summary || "מסמך סרוק").trim(),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    is_unpaid_bill: isPersonal ? false : Boolean(parsed.is_unpaid_bill),
    amount:
      !isPersonal &&
      parsed.amount != null &&
      !Number.isNaN(Number(parsed.amount))
        ? Number(parsed.amount)
        : null,
    due_date:
      !isPersonal && parsed.due_date
        ? String(parsed.due_date).slice(0, 10)
        : null,
    is_personal_doc: isPersonal,
    document_number: parsed.document_number
      ? String(parsed.document_number).trim()
      : null,
    expiration_date: parsed.expiration_date
      ? String(parsed.expiration_date).slice(0, 10)
      : null,
    tags: normalizeTags(parsed.tags),
  };
}

/** Classify a raw file buffer (PDF/image) — used by Gmail ingest. */
export async function classifyBuffer(
  buffer: Buffer,
  mimeType: string,
  opts?: { fileName?: string; forcePersonal?: boolean }
): Promise<{
  result: ClassificationResult;
  provider: VisionProvider | "demo";
  memoryUsed?: number;
}> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  return classifyDocument(dataUrl, {
    fileName: opts?.fileName,
    forcePersonal: opts?.forcePersonal,
  });
}

function dataUrlParts(dataUrl: string): { mime: string; base64: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (match) return { mime: match[1], base64: match[2] };
  return { mime: "image/jpeg", base64: dataUrl.replace(/^data:.*?;base64,/, "") };
}

export type VisionProvider = "openai" | "gemini" | "anthropic";

export function resolveProvider(): VisionProvider | null {
  const preferred = (process.env.AI_PROVIDER || "").toLowerCase();
  if (preferred === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (
    preferred === "gemini" &&
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY)
  )
    return "gemini";
  if (preferred === "anthropic" && process.env.ANTHROPIC_API_KEY)
    return "anthropic";

  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY)
    return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

async function classifyOpenAI(
  imageDataUrl: string,
  systemPrompt: string
): Promise<ClassificationResult> {
  const { mime, base64 } = dataUrlParts(imageDataUrl);
  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Classify this scanned document. Return JSON only. Obey few-shot examples and user overrides.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");
  return parseClassificationJson(content);
}

async function classifyGemini(
  imageDataUrl: string,
  systemPrompt: string
): Promise<ClassificationResult> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GEMINI_VISION_MODEL || "gemini-1.5-flash";
  const { mime, base64 } = dataUrlParts(imageDataUrl);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemPrompt}\n\nClassify this scanned document. Return JSON only.`,
              },
              { inline_data: { mime_type: mime, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error: ${err}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Empty Gemini response");
  return parseClassificationJson(content);
}

async function classifyAnthropic(
  imageDataUrl: string,
  systemPrompt: string
): Promise<ClassificationResult> {
  const { mime, base64 } = dataUrlParts(imageDataUrl);
  const model =
    process.env.ANTHROPIC_VISION_MODEL || "claude-3-5-sonnet-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 768,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mime, data: base64 },
            },
            {
              type: "text",
              text: "Classify this scanned document. Return JSON only. Obey few-shot examples and user overrides.",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error: ${err}`);
  }

  const data = await res.json();
  const content = data.content?.find(
    (b: { type: string }) => b.type === "text"
  )?.text;
  if (!content) throw new Error("Empty Anthropic response");
  return parseClassificationJson(content);
}

export async function classifyDocument(
  imageDataUrl: string,
  opts?: { fileName?: string; hint?: string; forcePersonal?: boolean }
): Promise<{
  result: ClassificationResult;
  provider: VisionProvider | "demo";
  memoryUsed: number;
  adaptivePromptPreview?: string;
}> {
  const memory = await loadClassificationMemory();
  const systemPrompt = buildAdaptiveSystemPrompt(memory);
  const memoryUsed = memory.examples.length;
  const forcePersonal = Boolean(opts?.forcePersonal);
  const personalHint =
    forcePersonal || looksLikePersonalDocument(opts?.fileName, opts?.hint);

  console.info(
    `[ai/classify] Adaptive few-shot: ${memoryUsed} examples, ${memory.feedbackOverrides.length} overrides, ${memory.knownFolders.length} folders` +
      (forcePersonal ? ", forcePersonal=true" : "") +
      (personalHint ? ", personalHint=true" : "")
  );

  const provider = resolveProvider();

  // Demo / no LLM key — never return invoice mock for personal docs
  if (!provider) {
    if (personalHint || forcePersonal) {
      console.info(
        "[ai/classify] Demo personal-vault override (no API key + personal toggle/hint)"
      );
      return {
        provider: "demo",
        memoryUsed,
        adaptivePromptPreview: systemPrompt.slice(0, 500),
        result: personalVaultDemoResult(
          opts?.hint || opts?.fileName || "רישיון נהיגה"
        ),
      };
    }

    // Prefer personal examples from memory over invoice mock
    const personalEx = memory.examples.find((e) =>
      ["Passport", "Driver_License", "ID_Card", "Car_License"].includes(
        e.doc_type
      )
    );
    if (personalEx) {
      return {
        provider: "demo",
        memoryUsed,
        adaptivePromptPreview: systemPrompt.slice(0, 500),
        result: {
          doc_type: personalEx.doc_type as DocType,
          vendor: "State_of_Israel",
          suggested_folder_name: PERSONAL_VAULT_FOLDER_HE,
          summary: personalEx.summary || "מסמך אישי",
          confidence: 0.9,
          is_unpaid_bill: false,
          is_personal_doc: true,
          amount: null,
          due_date: null,
          tags: [],
        },
      };
    }

    // Invoice demo — use a non-learned vendor so 3-Strike Demo_Vendor
    // never auto-files unrelated scans as invoices.
    return {
      provider: "demo",
      memoryUsed,
      adaptivePromptPreview: systemPrompt.slice(0, 500),
      result: {
        doc_type: "Invoice",
        vendor: "Demo_Invoice_Unverified",
        suggested_folder_name: "חשבוניות דמו 2026",
        summary: "חשבונית דמו",
        confidence: 0.85,
        is_unpaid_bill: true,
        amount: 154.5,
        due_date: new Date(Date.now() + 14 * 86400000)
          .toISOString()
          .slice(0, 10),
        is_personal_doc: false,
        tags: [],
      },
    };
  }

  let result: ClassificationResult;
  if (provider === "openai") {
    result = await classifyOpenAI(imageDataUrl, systemPrompt);
  } else if (provider === "gemini") {
    result = await classifyGemini(imageDataUrl, systemPrompt);
  } else {
    result = await classifyAnthropic(imageDataUrl, systemPrompt);
  }

  // Filename / UI toggle wins over mistaken invoice classification
  if ((personalHint || forcePersonal) && !result.is_personal_doc) {
    result = {
      ...personalVaultDemoResult(opts?.fileName || opts?.hint || "רישיון"),
      confidence: Math.max(result.confidence, 0.92),
      document_number: result.document_number ?? "053088654",
      expiration_date: result.expiration_date ?? "2026-01-01",
    };
  } else {
    result = applyFeedbackOverrides(result, memory.feedbackOverrides);
  }

  // Never let invoice feedback override a personal classification
  if (result.is_personal_doc) {
    result = {
      ...result,
      is_unpaid_bill: false,
      amount: null,
      due_date: null,
      suggested_folder_name: PERSONAL_VAULT_FOLDER_HE,
      vendor:
        result.vendor === "Demo_Vendor" ||
        result.vendor === "Demo_Invoice_Unverified"
          ? "State_of_Israel"
          : result.vendor,
    };
  }

  return {
    provider,
    result,
    memoryUsed,
    adaptivePromptPreview: systemPrompt.slice(0, 800),
  };
}

export { PERSONAL_TYPES };
