import { NextResponse } from "next/server";
import { classifyDocument } from "@/lib/ai/classify";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai/classify
 * Body: { imageBase64: string }  // data URL or raw base64 of scanned page/PDF preview
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const imageBase64 = body.imageBase64 as string | undefined;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    const payload = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    const { result, provider } = await classifyDocument(payload);

    return NextResponse.json({
      ...result,
      provider,
      demo: provider === "demo",
    });
  } catch (e) {
    console.error("[ai/classify]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Classification failed" },
      { status: 500 }
    );
  }
}
