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

/**
 * Lightweight document-edge heuristic for real-time preview.
 * Samples luminance gradients and finds high-contrast corners of a
 * rectangular region — good enough for viewfinder guidance without OpenCV.
 */
export function detectDocumentEdges(
  imageData: ImageData,
  width: number,
  height: number
): Quad | null {
  const data = imageData.data;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

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

  const regions = [
    { x0: 0, y0: 0, x1: width * 0.4, y1: height * 0.4 },
    { x0: width * 0.6, y0: 0, x1: width, y1: height * 0.4 },
    { x0: width * 0.6, y0: height * 0.6, x1: width, y1: height },
    { x0: 0, y0: height * 0.6, x1: width * 0.4, y1: height },
  ];

  const corners: Point[] = [];
  for (const r of regions) {
    let best = 0;
    let bx = (r.x0 + r.x1) / 2;
    let by = (r.y0 + r.y1) / 2;
    for (let y = Math.floor(r.y0); y < Math.floor(r.y1); y += 2) {
      for (let x = Math.floor(r.x0); x < Math.floor(r.x1); x += 2) {
        const v = sobel[y * width + x];
        if (v > best) {
          best = v;
          bx = x;
          by = y;
        }
      }
    }
    if (best < 40) return null;
    corners.push({ x: bx, y: by });
  }

  return orderQuad(corners);
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
