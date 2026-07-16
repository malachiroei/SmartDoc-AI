import { jsPDF } from "jspdf";
import type { ScannedPage, ExportFormat } from "../types";
import { loadImage } from "./perspective";

export async function exportPages(
  pages: ScannedPage[],
  format: ExportFormat,
  filename = "scan"
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  if (pages.length === 0) {
    throw new Error("No pages to export");
  }

  if (format === "jpg") {
    const page = pages[0];
    const res = await fetch(page.processedDataUrl);
    const blob = await res.blob();
    return {
      blob,
      filename: `${filename}.jpg`,
      mimeType: "image/jpeg",
    };
  }

  const first = await loadImage(pages[0].processedDataUrl);
  const orientation = first.width >= first.height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: [first.width, first.height],
  });

  for (let i = 0; i < pages.length; i++) {
    const img = await loadImage(pages[i].processedDataUrl);
    if (i > 0) {
      pdf.addPage([img.width, img.height], img.width >= img.height ? "l" : "p");
    }
    pdf.addImage(img.src, "JPEG", 0, 0, img.width, img.height);
  }

  const blob = pdf.output("blob");
  return {
    blob,
    filename: `${filename}.pdf`,
    mimeType: "application/pdf",
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
