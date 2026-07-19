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

/** Soft manual guide when detection fails — not a fake “locked” document */
export function guidanceQuad(width: number, height: number): Quad {
  return defaultQuad(width, height, 0.18);
}

/** Full-bleed crop box (no inset) — use when user chooses Full Page */
export function fullFrameQuad(width: number, height: number): Quad {
  return defaultQuad(width, height, 0);
}

/** Confidence at which UI shows a teal “locked” frame */
export const LOCK_CONFIDENCE = 0.55;

/** Minimum confidence to treat corners as a real document (not just guidance) */
export const DETECT_CONFIDENCE_MIN = 0.28;

export type EdgeDetectResult = {
  quad: Quad;
  /** 0–1 confidence that detected edges match a real document */
  confidence: number;
};

/**
 * CamScanner-style document edge detection.
 * Ranks bright paper, color cards, and edge rectangles — refuses desk-wide false locks.
 */
export function detectDocumentEdges(
  imageData: ImageData,
  width: number,
  height: number
): EdgeDetectResult | null {
  const data = imageData.data;
  const gray = new Float32Array(width * height);
  const sobel = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  computeSobel(gray, sobel, width, height);

  const candidates: EdgeDetectResult[] = [];
  const paper = detectPaperQuad(gray, width, height);
  if (paper) candidates.push(paper);
  const colorCard = detectColorCardBlob(data, gray, width, height);
  if (colorCard) candidates.push(colorCard);
  const edgeRect = detectRectangleByEdgeScore(sobel, width, height);
  if (edgeRect) candidates.push(edgeRect);

  let seed: Quad | null = null;
  {
    let bestSeed: EdgeDetectResult | null = null;
    for (const c of candidates) {
      if (quadCoverage(c.quad, width, height) > 0.5) continue;
      if (!bestSeed || c.confidence > bestSeed.confidence) bestSeed = c;
    }
    seed = bestSeed?.quad ?? null;
  }

  const sobelResult = detectSobelCorners(sobel, width, height, seed);
  if (sobelResult) candidates.push(sobelResult);
  if (candidates.length === 0) return null;

  let best: EdgeDetectResult | null = null;
  for (const c of candidates) {
    const ranked: EdgeDetectResult = {
      quad: snapQuadToEdges(c.quad, sobel, width, height),
      confidence: rankDetection(
        c.quad,
        sobel,
        gray,
        data,
        width,
        height,
        c.confidence
      ),
    };
    if (!best || ranked.confidence > best.confidence) best = ranked;
  }

  return best && best.confidence >= 0.12 ? best : null;
}

function quadCoverage(quad: Quad, width: number, height: number): number {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  return (
    ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) /
    Math.max(1, width * height)
  );
}

function borderTouchCount(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  width: number,
  height: number
): number {
  const m = 0.025;
  return (
    (minX < width * m ? 1 : 0) +
    (maxX > width * (1 - m) ? 1 : 0) +
    (minY < height * m ? 1 : 0) +
    (maxY > height * (1 - m) ? 1 : 0)
  );
}

/** Mid-size docs/cards win; near-full desk floods can never look “locked”. */
function rankDetection(
  quad: Quad,
  sobel: Float32Array,
  gray: Float32Array,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  prior: number
): number {
  void gray;
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cov = ((maxX - minX) * (maxY - minY)) / Math.max(1, width * height);
  const bw = maxX - minX;
  const bh = maxY - minY;
  const aspect = bw / Math.max(1, bh);
  const borders = borderTouchCount(minX, minY, maxX, maxY, width, height);

  if (cov < 0.025 || cov > 0.72) return Math.min(prior, 0.15);
  if (borders >= 3) return Math.min(prior, 0.18);
  if (borders >= 2 && cov > 0.4) return Math.min(prior, 0.22);

  const peri = perimeterEdgeScore(sobel, width, height, minX, minY, maxX, maxY);
  const interior = interiorEdgeMean(sobel, width, height, minX, minY, maxX, maxY);
  const chroma = meanChroma(rgba, width, height, minX, minY, maxX, maxY);
  const centerDist =
    Math.hypot((minX + maxX) / 2 - width / 2, (minY + maxY) / 2 - height / 2) /
    (Math.hypot(width, height) / 2);

  let score = prior * 0.3;
  score += Math.min(0.28, peri / 140);
  if (chroma > 28) score += Math.min(0.24, chroma / 110);
  else score += Math.min(0.16, Math.max(0, 45 - interior) / 45 * 0.16);

  if (cov >= 0.03 && cov <= 0.18) score += 0.18;
  else if (cov > 0.18 && cov <= 0.45) score += 0.14;
  else if (cov > 0.45 && cov <= 0.55) score += 0.02;
  else score -= 0.14;

  if (aspect >= 0.55 && aspect <= 0.9) score += 0.1;
  else if (aspect >= 1.25 && aspect <= 1.75) score += 0.14;
  else if (aspect >= 0.9 && aspect <= 1.25) score += 0.04;

  score += (1 - Math.min(1, centerDist)) * 0.08;
  if (borders >= 2) score -= 0.14;
  if (cov > 0.58) score = Math.min(score, 0.3);
  else if (cov > 0.48) score = Math.min(score, 0.46);
  if (peri < 26) score = Math.min(score, 0.28);

  return Math.max(0, Math.min(0.97, score));
}

function meanChroma(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const ix0 = Math.max(0, Math.floor(x0 + (x1 - x0) * 0.15));
  const iy0 = Math.max(0, Math.floor(y0 + (y1 - y0) * 0.15));
  const ix1 = Math.min(width - 1, Math.floor(x1 - (x1 - x0) * 0.15));
  const iy1 = Math.min(height - 1, Math.floor(y1 - (y1 - y0) * 0.15));
  if (ix1 <= ix0 || iy1 <= iy0) return 0;
  let sum = 0;
  let n = 0;
  for (let y = iy0; y <= iy1; y += 3) {
    for (let x = ix0; x <= ix1; x += 3) {
      const i = (y * width + x) * 4;
      sum += Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Orange/colored ID cards — luminance alone often blends into the desk. */
function detectColorCardBlob(
  rgba: Uint8ClampedArray,
  gray: Float32Array,
  width: number,
  height: number
): EdgeDetectResult | null {
  const scale = 2;
  const dw = Math.floor(width / scale);
  const dh = Math.floor(height / scale);
  if (dw < 8 || dh < 8) return null;

  const mask = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = x * scale;
      const sy = y * scale;
      const i = (sy * width + sx) * 4;
      const chroma =
        Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) -
        Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      const lum = gray[sy * width + sx];
      mask[y * dw + x] = chroma >= 32 && lum > 35 && lum < 245 ? 1 : 0;
    }
  }

  const comps = findTopComponents(mask, dw, dh, 6);
  let best: EdgeDetectResult | null = null;

  for (const c of comps) {
    const minX = c.minX * scale;
    const minY = c.minY * scale;
    const maxX = Math.min(width - 1, (c.maxX + 1) * scale);
    const maxY = Math.min(height - 1, (c.maxY + 1) * scale);
    const bw = maxX - minX;
    const bh = maxY - minY;
    const coverage = (bw * bh) / (width * height);
    const aspect = bw / Math.max(1, bh);
    const fill =
      c.count / Math.max(1, (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1));
    const borders = borderTouchCount(minX, minY, maxX, maxY, width, height);

    if (coverage < 0.02 || coverage > 0.35) continue;
    if (aspect < 0.45 || aspect > 2.3) continue;
    if (fill < 0.45 || borders >= 2) continue;

    const padX = Math.max(1, bw * 0.02);
    const padY = Math.max(1, bh * 0.02);
    const quad = orderQuad([
      { x: minX + padX, y: minY + padY },
      { x: maxX - padX, y: minY + padY },
      { x: maxX - padX, y: maxY - padY },
      { x: minX + padX, y: maxY - padY },
    ]);

    let confidence =
      0.62 + Math.min(0.18, fill * 0.22) + Math.min(0.12, (0.22 - coverage) * 0.6);
    if (aspect >= 1.35 && aspect <= 1.75) confidence += 0.12;
    if (coverage >= 0.03 && coverage <= 0.2) confidence += 0.1;
    confidence = Math.min(0.95, confidence);

    if (!best || confidence > best.confidence) best = { quad, confidence };
  }

  return best;
}

type CompBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
};

function findTopComponents(
  mask: Uint8Array,
  dw: number,
  dh: number,
  maxKeep: number
): CompBox[] {
  const seen = new Uint8Array(dw * dh);
  const stack = new Int32Array(dw * dh);
  const comps: CompBox[] = [];

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const start = y * dw + x;
      if (!mask[start] || seen[start]) continue;
      let sp = 0;
      stack[sp++] = start;
      seen[start] = 1;
      let count = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (sp > 0) {
        const i = stack[--sp];
        const cx = i % dw;
        const cy = (i / dw) | 0;
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const n of [i - 1, i + 1, i - dw, i + dw]) {
          if (n < 0 || n >= mask.length) continue;
          const nx = n % dw;
          const ny = (n / dw) | 0;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (!mask[n] || seen[n]) continue;
          seen[n] = 1;
          stack[sp++] = n;
        }
      }
      if (count >= 20) comps.push({ minX, minY, maxX, maxY, count });
    }
  }
  comps.sort((a, b) => b.count - a.count);
  return comps.slice(0, maxKeep);
}

function computeSobel(
  gray: Float32Array,
  sobel: Float32Array,
  width: number,
  height: number
) {
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
}

/** Score candidate AABBs by edge strength on their perimeter (great for cards). */
function detectRectangleByEdgeScore(
  sobel: Float32Array,
  width: number,
  height: number
): EdgeDetectResult | null {
  let bestScore = -1e9;
  let best: { minX: number; minY: number; maxX: number; maxY: number } | null =
    null;

  const aspects = [1.586, 1.414, 1.3, 1.0, 0.85, 0.707, 0.63];
  const coverages = [0.04, 0.07, 0.1, 0.14, 0.2, 0.28, 0.38, 0.48];

  for (const cov of coverages) {
    for (const aspect of aspects) {
      let rectH = Math.sqrt((width * height * cov) / aspect);
      let rectW = rectH * aspect;
      if (rectW > width * 0.92) {
        rectW = width * 0.88;
        rectH = rectW / aspect;
      }
      if (rectH > height * 0.92) {
        rectH = height * 0.88;
        rectW = rectH * aspect;
      }
      if (rectW < 20 || rectH < 20) continue;

      const stepX = Math.max(5, Math.round(width * 0.035));
      const stepY = Math.max(5, Math.round(height * 0.035));
      const maxX0 = Math.max(0, width - rectW);
      const maxY0 = Math.max(0, height - rectH);

      for (let y0 = 0; y0 <= maxY0; y0 += stepY) {
        for (let x0 = 0; x0 <= maxX0; x0 += stepX) {
          const x1 = x0 + rectW;
          const y1 = y0 + rectH;
          if (borderTouchCount(x0, y0, x1, y1, width, height) >= 3) continue;
          const score = perimeterEdgeScore(sobel, width, height, x0, y0, x1, y1);
          const interior = interiorEdgeMean(sobel, width, height, x0, y0, x1, y1);
          const cx = (x0 + x1) / 2 / width - 0.5;
          const cy = (y0 + y1) / 2 / height - 0.5;
          const centerBonus = 16 * (1 - Math.min(1, Math.hypot(cx, cy) * 2));
          const sizeBonus = cov <= 0.2 ? 16 : cov <= 0.4 ? 6 : -12;
          const ranked = score - interior * 0.65 + centerBonus + sizeBonus;
          if (ranked > bestScore) {
            bestScore = ranked;
            best = { minX: x0, minY: y0, maxX: x1, maxY: y1 };
          }
        }
      }
    }
  }

  if (!best || bestScore < 18) return null;

  // Local refine: nudge edges ±4% toward stronger perimeter
  const refined = refineRectEdges(sobel, width, height, best);

  const padX = Math.max(1, (refined.maxX - refined.minX) * 0.004);
  const padY = Math.max(1, (refined.maxY - refined.minY) * 0.004);
  const quad = orderQuad([
    { x: refined.minX + padX, y: refined.minY + padY },
    { x: refined.maxX - padX, y: refined.minY + padY },
    { x: refined.maxX - padX, y: refined.maxY - padY },
    { x: refined.minX + padX, y: refined.maxY - padY },
  ]);

  const coverage =
    ((refined.maxX - refined.minX) * (refined.maxY - refined.minY)) /
    (width * height);
  let confidence = Math.min(0.9, (bestScore / 100) * 0.5 + 0.28);
  if (coverage > 0.5) confidence = Math.min(confidence, 0.38);
  else if (coverage >= 0.04 && coverage <= 0.22) confidence = Math.min(0.93, confidence + 0.14);
  else if (coverage >= 0.22 && coverage <= 0.45) confidence = Math.min(0.9, confidence + 0.08);

  return { quad, confidence };
}

function perimeterEdgeScore(
  sobel: Float32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const ix0 = Math.max(1, Math.floor(x0));
  const iy0 = Math.max(1, Math.floor(y0));
  const ix1 = Math.min(width - 2, Math.floor(x1));
  const iy1 = Math.min(height - 2, Math.floor(y1));
  if (ix1 - ix0 < 10 || iy1 - iy0 < 10) return 0;

  let sum = 0;
  let n = 0;
  const step = 2;
  for (let x = ix0; x <= ix1; x += step) {
    sum += sobel[iy0 * width + x] + sobel[iy1 * width + x];
    n += 2;
  }
  for (let y = iy0; y <= iy1; y += step) {
    sum += sobel[y * width + ix0] + sobel[y * width + ix1];
    n += 2;
  }
  return n ? sum / n : 0;
}

function interiorEdgeMean(
  sobel: Float32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const ix0 = Math.max(1, Math.floor(x0 + (x1 - x0) * 0.18));
  const iy0 = Math.max(1, Math.floor(y0 + (y1 - y0) * 0.18));
  const ix1 = Math.min(width - 2, Math.floor(x1 - (x1 - x0) * 0.18));
  const iy1 = Math.min(height - 2, Math.floor(y1 - (y1 - y0) * 0.18));
  if (ix1 <= ix0 || iy1 <= iy0) return 999;

  let sum = 0;
  let n = 0;
  const step = 3;
  for (let y = iy0; y <= iy1; y += step) {
    for (let x = ix0; x <= ix1; x += step) {
      sum += sobel[y * width + x];
      n++;
    }
  }
  return n ? sum / n : 999;
}

function refineRectEdges(
  sobel: Float32Array,
  width: number,
  height: number,
  rect: { minX: number; minY: number; maxX: number; maxY: number }
) {
  const spanX = (rect.maxX - rect.minX) * 0.06;
  const spanY = (rect.maxY - rect.minY) * 0.06;
  const midY = (rect.minY + rect.maxY) / 2;
  const midX = (rect.minX + rect.maxX) / 2;
  const halfH = (rect.maxY - rect.minY) * 0.35;
  const halfW = (rect.maxX - rect.minX) * 0.35;

  const bestEdge = (
    axis: "x" | "y",
    center: number,
    from: number,
    to: number
  ) => {
    let best = center;
    let bestV = -1;
    const a0 = Math.min(from, to);
    const a1 = Math.max(from, to);
    for (let a = a0; a <= a1; a += 1) {
      let sum = 0;
      let n = 0;
      if (axis === "x") {
        const x = Math.max(1, Math.min(width - 2, Math.round(a)));
        for (let y = midY - halfH; y <= midY + halfH; y += 2) {
          const yy = Math.max(1, Math.min(height - 2, Math.round(y)));
          sum += sobel[yy * width + x];
          n++;
        }
      } else {
        const y = Math.max(1, Math.min(height - 2, Math.round(a)));
        for (let x = midX - halfW; x <= midX + halfW; x += 2) {
          const xx = Math.max(1, Math.min(width - 2, Math.round(x)));
          sum += sobel[y * width + xx];
          n++;
        }
      }
      const v = n ? sum / n : 0;
      if (v > bestV) {
        bestV = v;
        best = a;
      }
    }
    return best;
  };

  return {
    minX: bestEdge("x", rect.minX, rect.minX - spanX, rect.minX + spanX),
    maxX: bestEdge("x", rect.maxX, rect.maxX - spanX, rect.maxX + spanX),
    minY: bestEdge("y", rect.minY, rect.minY - spanY, rect.minY + spanY),
    maxY: bestEdge("y", rect.maxY, rect.maxY - spanY, rect.maxY + spanY),
  };
}

/** Pull each corner onto the nearest strong Sobel peak for a tight CamScanner box */
function snapQuadToEdges(
  quad: Quad,
  sobel: Float32Array,
  width: number,
  height: number
): Quad {
  const radius = Math.max(6, Math.round(Math.min(width, height) * 0.035));
  const snapped: Point[] = [];
  for (const p of quad) {
    let best = 0;
    let bx = p.x;
    let by = p.y;
    const x0 = Math.max(1, Math.floor(p.x - radius));
    const x1 = Math.min(width - 2, Math.ceil(p.x + radius));
    const y0 = Math.max(1, Math.floor(p.y - radius));
    const y1 = Math.min(height - 2, Math.ceil(p.y + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = sobel[y * width + x];
        const dist = Math.hypot(x - p.x, y - p.y) / radius;
        const scored = v * (1.1 - dist * 0.35);
        if (scored > best) {
          best = scored;
          bx = x;
          by = y;
        }
      }
    }
    snapped.push({ x: bx, y: by });
  }
  return orderQuad(snapped);
}

/** Detect document from luminance + largest bright connected component (A4 on desk) */
function detectPaperQuad(
  gray: Float32Array,
  width: number,
  height: number
): EdgeDetectResult | null {
  const blob = detectBrightDocumentBlob(gray, width, height);

  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;

  // Classic AABB — also try inverted (dark paper on bright desk)
  const bright = findLuminanceBBox(gray, width, height, mean + 22, true);
  const brightHi = findLuminanceBBox(gray, width, height, mean + 38, true);
  const dark = findLuminanceBBox(gray, width, height, mean - 16, false);

  const boxes = [bright, brightHi, dark].filter(Boolean) as Array<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    count: number;
    fill: number;
    coverage: number;
  }>;

  let aabbResult: EdgeDetectResult | null = null;
  if (boxes.length > 0) {
    boxes.sort((a, b) => b.fill * b.coverage - a.fill * a.coverage);
    const best = boxes[0];
    const padX = Math.max(1, (best.maxX - best.minX) * 0.006);
    const padY = Math.max(1, (best.maxY - best.minY) * 0.006);
    const quad = orderQuad([
      { x: best.minX + padX, y: best.minY + padY },
      { x: best.maxX - padX, y: best.minY + padY },
      { x: best.maxX - padX, y: best.maxY - padY },
      { x: best.minX + padX, y: best.maxY - padY },
    ]);

    let confidence =
      0.42 +
      Math.min(0.35, best.coverage * 0.5) +
      Math.min(0.25, best.fill * 0.35);
    if (best.coverage > 0.88) confidence *= 0.35;
    if (best.coverage > 0.55) confidence *= 0.45;
    if (best.coverage < 0.18) confidence *= 0.7;
    const aspect =
      (best.maxX - best.minX) / Math.max(1, best.maxY - best.minY);
    if (aspect > 0.55 && aspect < 1.85) confidence = Math.min(0.98, confidence + 0.08);
    const borders = borderTouchCount(
      best.minX,
      best.minY,
      best.maxX,
      best.maxY,
      width,
      height
    );
    if (borders >= 3) confidence = Math.min(confidence, 0.2);
    if (borders >= 2 && best.coverage > 0.4) confidence = Math.min(confidence, 0.28);
    // Huge near-full-frame AABB is usually “desk flood” — demote hard
    if (best.coverage > 0.65) confidence = Math.min(confidence, 0.22);

    aabbResult = { quad, confidence: Math.max(0, Math.min(0.98, confidence)) };
  }

  if (blob && aabbResult) {
    return blob.confidence >= aabbResult.confidence ? blob : aabbResult;
  }
  return blob ?? aabbResult;
}

/**
 * Bright document blobs — prefers mid-size paper over desk flood.
 * Evaluates top connected components, not only the largest (desk).
 */
function detectBrightDocumentBlob(
  gray: Float32Array,
  width: number,
  height: number
): EdgeDetectResult | null {
  const step = Math.max(1, Math.floor((width * height) / 10000));
  const samples: number[] = [];
  for (let i = 0; i < gray.length; i += step) samples.push(gray[i]);
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.5)] ?? 128;
  const p75 = samples[Math.floor(samples.length * 0.75)] ?? 160;
  const p88 = samples[Math.floor(samples.length * 0.88)] ?? 200;

  const threshCandidates = [
    Math.min(242, Math.max(p50 + 22, p75 + 4)),
    Math.min(245, (p75 + p88) / 2 + 4),
    Math.min(250, p88 + 2),
  ];

  let best: EdgeDetectResult | null = null;
  const scale = 2;
  const dw = Math.floor(width / scale);
  const dh = Math.floor(height / scale);
  if (dw < 8 || dh < 8) return null;

  for (const thresh of threshCandidates) {
    const mask = new Uint8Array(dw * dh);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        mask[y * dw + x] = gray[y * scale * width + x * scale] >= thresh ? 1 : 0;
      }
    }

    const comps = findTopComponents(mask, dw, dh, 8);
    for (const c of comps) {
      const minX = c.minX * scale;
      const minY = c.minY * scale;
      const maxX = Math.min(width - 1, (c.maxX + 1) * scale);
      const maxY = Math.min(height - 1, (c.maxY + 1) * scale);
      const bw = maxX - minX;
      const bh = maxY - minY;
      const coverage = (bw * bh) / (width * height);
      const aspect = bw / Math.max(1, bh);
      const fill =
        c.count / Math.max(1, (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1));
      const borders = borderTouchCount(minX, minY, maxX, maxY, width, height);

      // Desk floods touch many borders / cover most of the frame
      if (borders >= 3) continue;
      if (borders >= 2 && coverage > 0.35) continue;
      if (coverage < 0.05 || coverage > 0.55) continue;
      if (aspect < 0.45 || aspect > 2.3) continue;
      if (fill < 0.4) continue;

      const padX = Math.max(1, bw * 0.012);
      const padY = Math.max(1, bh * 0.012);
      const quad = orderQuad([
        { x: minX + padX, y: minY + padY },
        { x: maxX - padX, y: minY + padY },
        { x: maxX - padX, y: maxY - padY },
        { x: minX + padX, y: maxY - padY },
      ]);

      let confidence =
        0.48 + Math.min(0.2, fill * 0.25) + Math.min(0.16, (0.4 - Math.abs(coverage - 0.28)) * 0.5);
      if (aspect > 0.58 && aspect < 0.86) confidence += 0.12;
      else if (aspect > 1.15 && aspect < 1.65) confidence += 0.1;
      if (coverage >= 0.1 && coverage <= 0.4) confidence += 0.1;
      if (borders === 0) confidence += 0.06;
      confidence = Math.min(0.94, confidence);

      if (!best || confidence > best.confidence) best = { quad, confidence };
    }
  }

  return best;
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
  sobel: Float32Array,
  width: number,
  height: number,
  paperRoi: Quad | null
): EdgeDetectResult | null {
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
  minConfidence = DETECT_CONFIDENCE_MIN
): { quad: Quad; confidence: number } {
  const w = canvas.width;
  const h = canvas.height;
  const sw = Math.min(1280, w);
  const sh = Math.round((h / w) * sw);
  const sample = document.createElement("canvas");
  sample.width = sw;
  sample.height = sh;
  const sctx = sample.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const img = sctx.getImageData(0, 0, sw, sh);
  const detected = detectDocumentEdges(img, sw, sh);

  const scaleX = w / sw;
  const scaleY = h / sh;
  const scaleQuad = (quad: Quad): Quad =>
    quad.map((p) => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
    })) as Quad;

  // Accept weak-but-real detections (blue frame on paper) — never invent near-full-frame “lock”
  if (detected && detected.confidence >= minConfidence) {
    return {
      confidence: detected.confidence,
      quad: scaleQuad(detected.quad),
    };
  }

  // Manual guidance inset only when detection truly failed
  return {
    quad: guidanceQuad(w, h),
    confidence: detected?.confidence ?? 0,
  };
}

/** Detect corners from an HTMLImageElement / data URL canvas (uploads) */
export function detectCornersFromImage(
  img: HTMLImageElement,
  minConfidence = DETECT_CONFIDENCE_MIN
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
      const di = (y * w + x) * 4;
      if (p.x < 0 || p.y < 0 || p.x >= srcW - 1 || p.y >= srcH - 1) {
        outData[di] = outData[di + 1] = outData[di + 2] = 255;
        outData[di + 3] = 255;
        continue;
      }
      // Bilinear sample — cleaner than nearest-neighbor (CamScanner-quality warp)
      const x0 = Math.floor(p.x);
      const y0 = Math.floor(p.y);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = p.x - x0;
      const fy = p.y - y0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const v =
          srcData[i00 + c] * (1 - fx) * (1 - fy) +
          srcData[i10 + c] * fx * (1 - fy) +
          srcData[i01 + c] * (1 - fx) * fy +
          srcData[i11 + c] * fx * fy;
        outData[di + c] = v;
      }
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
