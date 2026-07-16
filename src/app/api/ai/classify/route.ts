import { NextResponse } from "next/server";
import { classifyDocument } from "@/lib/ai/classify";
import { checkSupabaseEnv } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/classify
 * Body: { imageBase64: string }
 * Adaptive few-shot classification using Supabase memory.
 */
export async function POST(request: Request) {
  try {
    const env = checkSupabaseEnv();
    if (!env.ok) {
      console.warn(
        "[ai/classify] Supabase env missing (few-shot memory skipped):",
        env.missing.join(", ")
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "גוף הבקשה אינו JSON תקין" },
        { status: 400 }
      );
    }

    const imageBase64 = body.imageBase64 as string | undefined;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "נדרש שדה imageBase64" },
        { status: 400 }
      );
    }

    const payload = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    const { result, provider, memoryUsed, adaptivePromptPreview } =
      await classifyDocument(payload);

    return NextResponse.json({
      ...result,
      provider,
      demo: provider === "demo",
      memoryUsed,
      adaptive: memoryUsed > 0,
      // Debug preview (first ~800 chars) — helps verify few-shot injection
      promptPreview: adaptivePromptPreview,
    });
  } catch (e) {
    console.error("[ai/classify]", e);
    const message = e instanceof Error ? e.message : "הסיווג נכשל";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
