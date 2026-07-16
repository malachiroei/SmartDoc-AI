import type { ScanFilter } from "../types";

function cloneImageData(ctx: CanvasRenderingContext2D, w: number, h: number) {
  return ctx.getImageData(0, 0, w, h);
}

function toGrayscale(data: Uint8ClampedArray) {
  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = g;
  }
}

/** Adaptive high-contrast B&W — CamScanner "Magic Color" style */
function magicColor(data: Uint8ClampedArray, width: number, height: number) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const block = 16;
  const thresh = new Float32Array(width * height);

  for (let by = 0; by < height; by += block) {
    for (let bx = 0; bx < width; bx += block) {
      let sum = 0;
      let count = 0;
      const yMax = Math.min(by + block, height);
      const xMax = Math.min(bx + block, width);
      for (let y = by; y < yMax; y++) {
        for (let x = bx; x < xMax; x++) {
          sum += gray[y * width + x];
          count++;
        }
      }
      const mean = sum / count - 8;
      for (let y = by; y < yMax; y++) {
        for (let x = bx; x < xMax; x++) {
          thresh[y * width + x] = mean;
        }
      }
    }
  }

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const v = gray[p] > thresh[p] ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

function sharpen(data: Uint8ClampedArray, width: number, height: number) {
  const copy = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            sum += copy[idx] * kernel[ki++];
          }
        }
        data[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, sum));
      }
    }
  }
}

export function applyFilter(
  canvas: HTMLCanvasElement,
  filter: ScanFilter
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0);

  if (filter === "original") return out;

  const img = cloneImageData(ctx, out.width, out.height);

  if (filter === "grayscale") {
    toGrayscale(img.data);
  } else if (filter === "magic") {
    magicColor(img.data, out.width, out.height);
  } else if (filter === "sharp") {
    sharpen(img.data, out.width, out.height);
  }

  ctx.putImageData(img, 0, 0);
  return out;
}

export const FILTER_LABELS: Record<ScanFilter, string> = {
  original: "Original",
  magic: "Magic Color",
  grayscale: "Grayscale",
  sharp: "Sharp",
};
