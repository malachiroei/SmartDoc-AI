import type { ClassificationResult, DocType } from "@/lib/types";

const SYSTEM_PROMPT = `You are a document classification engine for SmartDoc AI (Hebrew users in Israel).
Analyze the scanned document image and respond with STRICTLY valid JSON only — no markdown, no commentary.

Schema:
{
  "doc_type": "Invoice | Receipt | Bill | Contract | ID | Other",
  "vendor": "String (e.g., 'Electra', 'Arnona_TelAviv', 'Apple_AppStore')",
  "suggested_folder_name": "String in HEBREW (clean folder name, e.g. 'חשבונות חשמל 2026', 'ארנונה תל אביב')",
  "summary": "String in HEBREW (2-3 words describing the doc, e.g. 'חשבון חשמל')",
  "confidence": 0.98,
  "is_unpaid_bill": true,
  "amount": 154.50,
  "due_date": "YYYY-MM-DD"
}

Rules:
- vendor: use PascalCase or Underscore_Case in Latin letters, no spaces; identify the company/issuer when possible.
- suggested_folder_name: MUST be in Hebrew. Natural, standardized folder name.
- summary: MUST be in Hebrew. Exactly 2-3 words.
- confidence: number between 0 and 1.
- is_unpaid_bill: true if this is an unpaid invoice/bill requiring payment; false for receipts, paid confirmations, contracts, IDs.
- amount: numeric total due (null if unknown or not a bill).
- due_date: ISO date YYYY-MM-DD when payment is due (null if unknown or not applicable).
- If unsure, use doc_type "Other" and a best-effort vendor.`;

const DOC_TYPES: DocType[] = [
  "Invoice",
  "Receipt",
  "Bill",
  "Contract",
  "ID",
  "Other",
];

export function parseClassificationJson(raw: string): ClassificationResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<ClassificationResult>;

  const docType = DOC_TYPES.includes(parsed.doc_type as DocType)
    ? (parsed.doc_type as DocType)
    : "Other";

  return {
    doc_type: docType,
    vendor: String(parsed.vendor || "Unknown").replace(/\s+/g, "_"),
    suggested_folder_name: String(
      parsed.suggested_folder_name || `${parsed.vendor || "Documents"}`
    ).trim(),
    summary: String(parsed.summary || "מסמך סרוק").trim(),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
    is_unpaid_bill: Boolean(parsed.is_unpaid_bill),
    amount:
      parsed.amount != null && !Number.isNaN(Number(parsed.amount))
        ? Number(parsed.amount)
        : null,
    due_date: parsed.due_date ? String(parsed.due_date).slice(0, 10) : null,
  };
}

/** Classify a raw file buffer (PDF/image) — used by Gmail ingest. */
export async function classifyBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<{ result: ClassificationResult; provider: VisionProvider | "demo" }> {
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  return classifyDocument(dataUrl);
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
  if (preferred === "gemini" && (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY))
    return "gemini";
  if (preferred === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";

  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

async function classifyOpenAI(imageDataUrl: string): Promise<ClassificationResult> {
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
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Classify this scanned document. Return JSON only.",
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

async function classifyGemini(imageDataUrl: string): Promise<ClassificationResult> {
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
              { text: `${SYSTEM_PROMPT}\n\nClassify this scanned document. Return JSON only.` },
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

async function classifyAnthropic(imageDataUrl: string): Promise<ClassificationResult> {
  const { mime, base64 } = dataUrlParts(imageDataUrl);
  const model = process.env.ANTHROPIC_VISION_MODEL || "claude-3-5-sonnet-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
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
              text: "Classify this scanned document. Return JSON only.",
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
  imageDataUrl: string
): Promise<{ result: ClassificationResult; provider: VisionProvider | "demo" }> {
  const provider = resolveProvider();

  if (!provider) {
    return {
      provider: "demo",
      result: {
        doc_type: "Invoice",
        vendor: "Demo_Vendor",
        suggested_folder_name: "חשבוניות דמו 2026",
        summary: "חשבונית דמו",
        confidence: 0.85,
        is_unpaid_bill: true,
        amount: 154.5,
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      },
    };
  }

  if (provider === "openai") {
    return { provider, result: await classifyOpenAI(imageDataUrl) };
  }
  if (provider === "gemini") {
    return { provider, result: await classifyGemini(imageDataUrl) };
  }
  return { provider, result: await classifyAnthropic(imageDataUrl) };
}

export { SYSTEM_PROMPT };
