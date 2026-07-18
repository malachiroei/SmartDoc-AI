import type { Point, Quad } from "../types";

/** Order corners: TL, TR, BR, BL */
export function orderQuad(points: Point[]): Quad {
  const sorted = [...points].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

export function defaultQuad(width: number, height: number, inset = 0.08): Quad {
  const ix = width * inset;
  const iy = height * inset;
  return [
    { x: ix, y: iy },
    { x: width - ix, y: iy },
    { x: width - ix, y: height - iy },
    { x: ix, y: height - iy },
  ];
}

/** Full-bleed crop box (no inset) — use when detection is weak or user chooses Full Page */
export function fullFrameQuad(width: number, height: number): Quad {
  return defaultQuad(width, height, 0);
}

export type EdgeDetectResult = {
  quad: Quad;
  /** 0–1 confidence that detected edges match a real document */
  confidence: number;
};

/**
 * CamScanner-style document edge detection.
 * Bright-paper bbox seeds the search; Sobel corners refine inside that ROI.
 */
export function detectDocumentEdges(
  imageData: ImageData,
  width: number,
  height: number
): EdgeDetectResult | null {
  const data = imageData.data;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  const paper = detectPaperQuad(gray, width, height);
  const sobelResult = detectSobelCorners(gray, width, height, paper?.quad ?? null);

  if (paper && sobelResult) {
    const agreement = cornerAgreement(paper.quad, sobelResult.quad, width, height);
    // Prefer perspective Sobel when it agrees with the paper region
    if (agreement >= 0.45 && sobelResult.confidence >= 0.35) {
      return {
        quad: sobelResult.quad,
        confidence: Math.min(
          1,
          sobelResult.confidence * 0.7 + paper.confidence * 0.2 + agreement * 0.25
        ),
      };
    }
    // Paper is safer AABB when Sobel is noisy
    if (paper.confidence >= sobelResult.confidence * 0.9) {
      return {
        quad: refinePaperWithSobel(paper.quad, sobelResult.quad, width, height),
        confidence: Math.min(0.95, paper.confidence + agreement * 0.1),
      };
    }
    return sobelResult.confidence >= paper.confidence ? sobelResult : paper;
  }
  return paper ?? sobelResult;
}

function cornerAgreement(a: Quad, b: Quad, width: number, height: number): number {
  const diag = Math.hypot(width, height) || 1;
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    sum += 1 - Math.min(1, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y) / (diag * 0.18));
  }
  return sum / 4;
}

/** Pull AABB corners slightly toward strong Sobel peaks when close */
function refinePaperWithSobel(paper: Quad, sobel: Quad, width: number, height: number): Quad {
  const maxDist = Math.hypot(width, height) * 0.12;
  const out: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const d = Math.hypot(paper[i].x - sobel[i].x, paper[i].y - sobel[i].y);
    if (d < maxDist) {
      out.push({
        x: paper[i].x * 0.35 + sobel[i].x * 0.65,
        y: paper[i].y * 0.35 + sobel[i].y * 0.65,
      });
    } else {
      out.push(paper[i]);
    }
  }
  return orderQuad(out);
}

/** Detect document from luminance (paper usually brighter than desk/background) */
function detectPaperQuad(
  gray: Float32Array,
  width: number,
  height: number
): EdgeDetectResult | null {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;

  // Also try inverted (dark paper on bright desk)
  const bright = findLuminanceBBox(gray, width, height, mean + 16, true);
  const dark = findLuminanceBBox(gray, width, height, mean - 16, false);

  const candidates = [bright, dark].filter(Boolean) as Array<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    count: number;
    fill: number;
    coverage: number;
  }>;

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.fill * b.coverage - a.fill * a.coverage);
  const best = candidates[0];

  const padX = Math.max(2, (best.maxX - best.minX) * 0.015);
  const padY = Math.max(2, (best.maxY - best.minY) * 0.015);
  const quad = orderQuad([
    { x: best.minX + padX, y: best.minY + padY },
    { x: best.maxX - padX, y: best.minY + padY },
    { x: best.maxX - padX, y: best.maxY - padY },
    { x: best.minX + padX, y: best.maxY - padY },
  ]);

  let confidence =
    0.45 +
    Math.min(0.35, best.coverage * 0.5) +
    Math.min(0.25, best.fill * 0.35);
  if (best.coverage > 0.88) confidence *= 0.7;
  if (best.coverage < 0.18) confidence *= 0.65;

  // Prefer aspect ratios typical of A4 / letters / ID cards
  const aspect =
    (best.maxX - best.minX) / Math.max(1, best.maxY - best.minY);
  if (aspect > 0.55 && aspect < 1.85) confidence = Math.min(0.98, confidence + 0.08);

  return { quad, confidence: Math.max(0, Math.min(0.98, confidence)) };
}

function findLuminanceBBox(
  gray: Float32Array,
  width: number,
  height: number,
  threshold: number,
  brighter: boolean
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
  fill: number;
  coverage: number;
} | null {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const v = gray[y * width + x];
      const hit = brighter ? v >= threshold : v <= threshold;
      if (hit) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (count < 50 || maxX <= minX || maxY <= minY) return null;

  const boxArea = Math.max(1, (maxX - minX) * (maxY - minY));
  const coverage = boxArea / (width * height);
  const fill = count / (boxArea / 4);

  if (coverage < 0.08 || coverage > 0.94 || fill < 0.12) return null;

  return { minX, minY, maxX, maxY, count, fill, coverage };
}

function detectSobelCorners(
  gray: Float32Array,
  width: number,
  height: number,
  paperRoi: Quad | null
): EdgeDetectResult | null {
  const sobel = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx =
        -gray[i - width - 1] +
        gray[i - width + 1] -
        2 * gray[i - 1] +
        2 * gray[i + 1] -
        gray[i + width - 1] +
        gray[i + width + 1];
      const gy =
        -gray[i - width - 1] -
        2 * gray[i - width] -
        gray[i - width + 1] +
        gray[i + width - 1] +
        2 * gray[i + width] +
        gray[i + width + 1];
      sobel[i] = Math.hypot(gx, gy);
    }
  }

  // Focus corner search near paper edges when available
  let regions = [
    { x0: 0, y0: 0, x1: width * 0.45, y1: height * 0.45 },
    { x0: width * 0.55, y0: 0, x1: width, y1: height * 0.45 },
    { x0: width * 0.55, y0: height * 0.55, x1: width, y1: height },
    { x0: 0, y0: height * 0.55, x1: width * 0.45, y1: height },
  ];

  if (paperRoi) {
    const xs = paperRoi.map((p) => p.x);
    const ys = paperRoi.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs) - width * 0.04);
    const maxX = Math.min(width, Math.max(...xs) + width * 0.04);
    const minY = Math.max(0, Math.min(...ys) - height * 0.04);
    const maxY = Math.min(height, Math.max(...ys) + height * 0.04);
    const mx = (minX + maxX) / 2;
    const my = (minY + maxY) / 2;
    regions = [
      { x0: minX, y0: minY, x1: mx, y1: my },
      { x0: mx, y0: minY, x1: maxX, y1: my },
      { x0: mx, y0: my, x1: maxX, y1: maxY },
      { x0: minX, y0: my, x1: mx, y1: maxY },
    ];
  }

  const corners: Point[] = [];
  const scores: number[] = [];
  for (const r of regions) {
    let best = 0;
    let bx = (r.x0 + r.x1) / 2;
    let by = (r.y0 + r.y1) / 2;
    // Prefer peaks near the outer corner of each quadrant (document corner)
    const preferX = r.x0 < width * 0.5 ? r.x0 : r.x1;
    const preferY = r.y0 < height * 0.5 ? r.y0 : r.y1;

    for (let y = Math.floor(r.y0); y < Math.floor(r.y1); y += 1) {
      for (let x = Math.floor(r.x0); x < Math.floor(r.x1); x += 1) {
        const v = sobel[y * width + x];
        const dist =
          Math.hypot(x - preferX, y - preferY) /
          (Math.hypot(r.x1 - r.x0, r.y1 - r.y0) || 1);
        const scored = v * (1.15 - Math.min(1, dist) * 0.35);
        if (scored > best) {
          best = scored;
          bx = x;
          by = y;
        }
      }
    }
    if (best < 28) return null;
    corners.push({ x: bx, y: by });
    scores.push(best);
  }

  const quad = orderQuad(corners);
  const [tl, tr, br, bl] = quad;

  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  let confidence = Math.min(1, (meanScore / 110) * 0.65 + (minScore / 70) * 0.35);

  const area =
    0.5 *
    Math.abs(
      tl.x * tr.y +
        tr.x * br.y +
        br.x * bl.y +
        bl.x * tl.y -
        (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x)
    );
  const coverage = area / (width * height);
  if (coverage < 0.1 || coverage > 0.96) confidence *= 0.45;
  else if (coverage < 0.22) confidence *= 0.7;

  const top = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottom = Math.hypot(br.x - bl.x, br.y - bl.y);
  const left = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const right = Math.hypot(br.x - tr.x, br.y - tr.y);
  const widthRatio = Math.min(top, bottom) / Math.max(top, bottom || 1);
  const heightRatio = Math.min(left, right) / Math.max(left, right || 1);
  if (widthRatio < 0.55 || heightRatio < 0.55) confidence *= 0.4;
  else if (widthRatio < 0.75 || heightRatio < 0.75) confidence *= 0.72;

  return { quad, confidence: Math.max(0, Math.min(1, confidence)) };
}

/** Run edge detect on a full capture canvas and scale corners to canvas size */
export function detectCornersFromCanvas(
  canvas: HTMLCanvasElement,
  minConfidence = 0.4
): { quad: Quad; confidence: number } {
  const w = canvas.width;
  const h = canvas.height;
  const sw = Math.min(960, w);
  const sh = Math.round((h / w) * sw);
  const sample = document.createElement("canvas");
  sample.width = sw;
  sample.height = sh;
  const sctx = sample.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const img = sctx.getImageData(0, 0, sw, sh);
  const detected = detectDocumentEdges(img, sw, sh);

  if (detected && detected.confidence >= minConfidence) {
    const scaleX = w / sw;
    const scaleY = h / sh;
    return {
      confidence: detected.confidence,
      quad: detected.quad.map((p) => ({
        x: p.x * scaleX,
        y: p.y * scaleY,
      })) as Quad,
    };
  }

  // Soft fallback: slight inset (better than full desk background)
  return { quad: defaultQuad(w, h, 0.05), confidence: detected?.confidence ?? 0 };
}

/** Detect corners from an HTMLImageElement / data URL canvas (uploads) */
export function detectCornersFromImage(
  img: HTMLImageElement,
  minConfidence = 0.35
): { quad: Quad; confidence: number } {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return detectCornersFromCanvas(canvas, minConfidence);
}

function getPerspectiveTransform(src: Quad, dst: Quad): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [x, y] = [src[i].x, src[i].y];
    const [u, v] = [dst[i].x, dst[i].y];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem(A, b);
  return [...h, 1];
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col] || 1e-12;
    for (let j = col; j <= n; j++) M[col][j] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  return M.map((row) => row[n]);
}

function applyHomography(H: number[], x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

export function warpPerspective(
  source: HTMLCanvasElement | ImageBitmap | HTMLImageElement,
  corners: Quad,
  outWidth?: number,
  outHeight?: number
): HTMLCanvasElement {
  const srcW =
    "width" in source && typeof source.width === "number"
      ? source.width
      : (source as HTMLImageElement).naturalWidth;
  const srcH =
    "height" in source && typeof source.height === "number"
      ? source.height
      : (source as HTMLImageElement).naturalHeight;

  const [tl, tr, br, bl] = corners;
  const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
  const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const heightA = Math.hypot(tr.x - br.x, tr.y - br.y);
  const heightB = Math.hypot(tl.x - bl.x, tl.y - bl.y);

  const maxW = Math.round(Math.max(widthA, widthB));
  const maxH = Math.round(Math.max(heightA, heightB));
  const w = outWidth ?? Math.max(200, maxW);
  const h = outHeight ?? Math.max(200, maxH);

  const dst: Quad = [
    { x: 0, y: 0 },
    { x: w - 1, y: 0 },
    { x: w - 1, y: h - 1 },
    { x: 0, y: h - 1 },
  ];

  // Inverse map: dest -> source
  const H = getPerspectiveTransform(dst, corners);

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true })!;
  srcCtx.drawImage(source as CanvasImageSource, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d")!;
  const outImg = outCtx.createImageData(w, h);
  const outData = outImg.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = applyHomography(H, x, y);
      const sx = Math.round(p.x);
      const sy = Math.round(p.y);
      const di = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= srcW || sy >= srcH) {
        outData[di] = outData[di + 1] = outData[di + 2] = 255;
        outData[di + 3] = 255;
        continue;
      }
      const si = (sy * srcW + sx) * 4;
      outData[di] = srcData[si];
      outData[di + 1] = srcData[si + 1];
      outData[di + 2] = srcData[si + 2];
      outData[di + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return out;
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png" = "image/jpeg",
  quality = 0.92
): string {
  return canvas.toDataURL(type, quality);
}
