/**
 * Client-only PDF → JPEG helpers.
 * pdfjs-dist is loaded dynamically to avoid SSR (DOMMatrix) crashes.
 */

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Renders each PDF page to a JPEG data URL for the scanner / AI classify pipeline.
 */
export async function pdfFileToImageDataUrls(
  file: File,
  options?: { maxPages?: number; scale?: number }
): Promise<string[]> {
  if (typeof window === "undefined") {
    throw new Error("PDF conversion is only available in the browser");
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const maxPages = options?.maxPages ?? 20;
  const scale = options?.scale ?? 2;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const urls: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas for PDF page");

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    urls.push(canvas.toDataURL("image/jpeg", 0.92));
  }

  return urls;
}
