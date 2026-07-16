import type { ClassificationResult, DocType } from "@/lib/types";
import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
import {
  applyFeedbackOverrides,
  formatFeedbackOverrides,
  formatFewShotBlock,
  loadClassificationMemory,
  type ClassificationMemory,
} from "@/lib/ai/memory";
import {
  isPersonalDocType,
  personalVaultDemoResult,
  sanitizePersonalClassification,
} from "@/lib/ai/personal";

export { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
export {
  isPersonalDocType,
  personalVaultDemoResult,
  sanitizePersonalClassification,
} from "@/lib/ai/personal";

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
- Look at the image carefully. If you see an Israeli Driver's License (רישיון נהיגה), Israeli ID (תעודת זהות), Passport (דרכון), or Vehicle License (רישיון רכב):
  * Extract the REAL full name (Hebrew if visible), REAL document/ID number, and REAL expiration date from the image.
  * Put the name into summary, e.g. "רישיון נהיגה - רועי מלאכי" or "דרכון - יוסי כהן".
  * Set document_number to the exact number printed on the card.
  * Set expiration_date to YYYY-MM-DD from the card (or null if unreadable).
  * Set is_personal_doc: true, is_unpaid_bill: false, amount: null, due_date: null.
  * Set suggested_folder_name exactly to "מסמכים אישיים".
  * NEVER classify these as Invoice, Bill, or Receipt.
- Prefer matching known vendors and folder names from the user's vocabulary below when possible.
- vendor: PascalCase or Underscore_Case Latin letters, no spaces (personal docs → State_of_Israel).
- summary: MUST be in Hebrew; for personal docs include the person's name when readable.
- Prefer specific personal types (Passport, Driver_License, ID_Card) over generic "ID".
`;

const USER_VISION_INSTRUCTION = `Look at this image carefully. Classify the document and return STRICT JSON only.

If this is an Israeli Driver's License (רישיון נהיגה), Israeli ID (תעודת זהות), or Passport (דרכון):
- Extract the REAL name, REAL ID/document number, and REAL expiration date from the image.
- Set is_personal_doc: true, is_unpaid_bill: false.
- Route to suggested_folder_name "מסמכים אישיים".
- summary should be Hebrew and include the person's name when visible.

Obey few-shot examples and user overrides from the system prompt.`;

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
  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (preferred === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (preferred === "gemini" && geminiKey) return "gemini";
  if (preferred === "anthropic" && process.env.ANTHROPIC_API_KEY)
    return "anthropic";

  if (process.env.OPENAI_API_KEY) return "openai";
  if (geminiKey) return "gemini";
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
              text: USER_VISION_INSTRUCTION,
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

const GEMINI_MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-pro-vision",
] as const;

function resolveGeminiModels(): string[] {
  const preferred =
    process.env.GEMINI_VISION_MODEL || process.env.GOOGLE_GEMINI_MODEL || "";
  // Drop retired / broken aliases (e.g. gemini-1.5-flash)
  const blocked = /gemini-1\.5|gemini-pro$/i;
  const ordered = [
    preferred,
    ...GEMINI_MODEL_FALLBACKS,
  ].filter((m) => m && !blocked.test(m));
  return [...new Set(ordered)];
}

function isGeminiModelNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /404|not found|is not supported for generateContent|NOT_FOUND/i.test(msg)
  );
}

async function classifyGeminiWithSdk(
  key: string,
  modelName: string,
  systemPrompt: string,
  mime: string,
  base64: string
): Promise<ClassificationResult> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    { text: USER_VISION_INSTRUCTION },
    {
      inlineData: {
        mimeType: mime || "image/jpeg",
        data: base64,
      },
    },
  ]);

  const content = result.response.text();
  if (!content) throw new Error("Empty Gemini response");
  return parseClassificationJson(content);
}

async function classifyGeminiWithRest(
  key: string,
  modelName: string,
  systemPrompt: string,
  mime: string,
  base64: string
): Promise<ClassificationResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: USER_VISION_INSTRUCTION },
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
    throw new Error(`Gemini error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Empty Gemini response");
  return parseClassificationJson(content);
}

async function classifyGemini(
  imageDataUrl: string,
  systemPrompt: string
): Promise<ClassificationResult> {
  const key =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");

  const { mime, base64 } = dataUrlParts(imageDataUrl);
  const models = resolveGeminiModels();
  const errors: string[] = [];

  for (const modelName of models) {
    try {
      const result = await classifyGeminiWithSdk(
        key,
        modelName,
        systemPrompt,
        mime,
        base64
      );
      console.info(`[ai/classify] Gemini SDK ok model=${modelName}`);
      return result;
    } catch (sdkErr) {
      const msg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      console.warn(`[ai/classify] Gemini SDK ${modelName} failed:`, msg);

      try {
        const result = await classifyGeminiWithRest(
          key,
          modelName,
          systemPrompt,
          mime,
          base64
        );
        console.info(`[ai/classify] Gemini REST ok model=${modelName}`);
        return result;
      } catch (restErr) {
        const restMsg =
          restErr instanceof Error ? restErr.message : String(restErr);
        errors.push(`${modelName}: ${restMsg}`);
        if (!isGeminiModelNotFound(sdkErr) && !isGeminiModelNotFound(restErr)) {
          // Non-404 errors (auth, quota, etc.) — still try next model once
          console.warn(
            `[ai/classify] Gemini ${modelName} failed, trying next fallback…`
          );
        } else {
          console.warn(
            `[ai/classify] Model ${modelName} not found (404), trying next…`
          );
        }
      }
    }
  }

  throw new Error(
    `Gemini classify failed for all models [${models.join(", ")}]: ${errors.join(" | ")}`
  );
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
              text: USER_VISION_INSTRUCTION,
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
        result: sanitizePersonalClassification(
          personalVaultDemoResult(
            opts?.hint || opts?.fileName || "רישיון נהיגה"
          ),
          opts?.hint || opts?.fileName
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
        result: sanitizePersonalClassification(
          {
            doc_type: personalEx.doc_type as DocType,
            vendor: "State_of_Israel",
            summary: personalEx.summary ?? undefined,
            confidence: 0.9,
          },
          personalEx.doc_type
        ),
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

  // Live LLM — preserve OCR fields; never invent demo ID/expiry
  if (personalHint || forcePersonal) {
    result = sanitizePersonalClassification(
      { ...result, is_personal_doc: true },
      opts?.hint || opts?.fileName || result.doc_type,
      { fillDefaults: false }
    );
  } else {
    result = applyFeedbackOverrides(result, memory.feedbackOverrides);
    if (result.is_personal_doc || isPersonalDocType(result.doc_type)) {
      result = sanitizePersonalClassification(result, result.doc_type, {
        fillDefaults: false,
      });
    }
  }

  console.info(
    `[ai/classify] provider=${provider} doc_type=${result.doc_type} personal=${result.is_personal_doc} number=${result.document_number ?? "—"}`
  );

  return {
    provider,
    result,
    memoryUsed,
    adaptivePromptPreview: systemPrompt.slice(0, 800),
  };
}

export { PERSONAL_TYPES };
