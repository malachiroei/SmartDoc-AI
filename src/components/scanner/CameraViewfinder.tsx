"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Quad } from "@/lib/types";
import {
  detectDocumentEdges,
  detectCornersFromCanvas,
  defaultQuad,
  fullFrameQuad,
} from "@/lib/image/perspective";
import { cn } from "@/lib/utils";
import { he } from "@/lib/i18n/he";

type Props = {
  onCapture: (dataUrl: string, corners: Quad) => void;
  edgeDetection?: boolean;
  className?: string;
};

/** Below this confidence in live preview, use soft inset instead of full desk */
const EDGE_CONFIDENCE_MIN = 0.45;
const CORNER_HIT_RADIUS = 36;

/**
 * Camera is browser-only. Parent should load this with dynamic(..., { ssr: false })
 * or only after a client `mounted` gate to avoid hydration mismatches.
 */
export function CameraViewfinder({
  onCapture,
  edgeDetection = true,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const cornersRef = useRef<Quad | null>(null);
  /** When true, auto-detect must not overwrite user-dragged / Full Page corners */
  const manualLockRef = useRef(false);
  const dragIndexRef = useRef<number | null>(null);
  const videoSizeRef = useRef({ w: 0, h: 0 });
  const smoothHistoryRef = useRef<Quad[]>([]);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [liveCorners, setLiveCorners] = useState<Quad | null>(null);
  const [edgeConfidence, setEdgeConfidence] = useState<number | null>(null);
  const [manualLock, setManualLock] = useState(false);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopStream();
    setError(null);
    setReady(false);
    manualLockRef.current = false;
    setManualLock(false);
    setEdgeConfidence(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(he.camera.denied);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setReady(true);
    } catch {
      setError(he.camera.denied);
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    void startCamera();
    return stopStream;
  }, [startCamera, stopStream]);

  const setCorners = useCallback((q: Quad, opts?: { manual?: boolean }) => {
    cornersRef.current = q;
    setLiveCorners(q);
    if (opts?.manual) {
      manualLockRef.current = true;
      setManualLock(true);
    }
  }, []);

  const applyFullPage = useCallback(() => {
    const video = videoRef.current;
    const w = video?.videoWidth || videoSizeRef.current.w;
    const h = video?.videoHeight || videoSizeRef.current.h;
    if (!w || !h) return;
    setCorners(fullFrameQuad(w, h), { manual: true });
    setEdgeConfidence(null);
  }, [setCorners]);

  const clientToVideo = useCallback(
    (clientX: number, clientY: number): Point | null => {
      const overlay = overlayRef.current;
      const { w, h } = videoSizeRef.current;
      if (!overlay || !w || !h) return null;
      const rect = overlay.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      // object-cover: map display coords → video pixel coords
      const scale = Math.max(rect.width / w, rect.height / h);
      const dispW = w * scale;
      const dispH = h * scale;
      const offsetX = (rect.width - dispW) / 2;
      const offsetY = (rect.height - dispH) / 2;
      const x = (clientX - rect.left - offsetX) / scale;
      const y = (clientY - rect.top - offsetY) / scale;
      return {
        x: Math.max(0, Math.min(w, x)),
        y: Math.max(0, Math.min(h, y)),
      };
    },
    []
  );

  const hitTestCorner = useCallback(
    (clientX: number, clientY: number): number | null => {
      const corners = cornersRef.current;
      const overlay = overlayRef.current;
      const { w, h } = videoSizeRef.current;
      if (!corners || !overlay || !w || !h) return null;
      const rect = overlay.getBoundingClientRect();
      const scale = Math.max(rect.width / w, rect.height / h);
      const dispW = w * scale;
      const dispH = h * scale;
      const offsetX = (rect.width - dispW) / 2;
      const offsetY = (rect.height - dispH) / 2;

      let best = -1;
      let bestDist = CORNER_HIT_RADIUS;
      for (let i = 0; i < 4; i++) {
        const dx = clientX - (rect.left + offsetX + corners[i].x * scale);
        const dy = clientY - (rect.top + offsetY + corners[i].y * scale);
        const d = Math.hypot(dx, dy);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best >= 0 ? best : null;
    },
    []
  );

  const onOverlayPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const idx = hitTestCorner(e.clientX, e.clientY);
    if (idx === null) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragIndexRef.current = idx;
    manualLockRef.current = true;
    setManualLock(true);
  };

  const onOverlayPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const idx = dragIndexRef.current;
    if (idx === null) return;
    const p = clientToVideo(e.clientX, e.clientY);
    if (!p || !cornersRef.current) return;
    const next = [...cornersRef.current] as Quad;
    next[idx] = p;
    setCorners(next, { manual: true });
  };

  const onOverlayPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragIndexRef.current === null) return;
    dragIndexRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  useEffect(() => {
    if (!ready || !edgeDetection) return;

    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    const sample = document.createElement("canvas");
    const sampleCtx = sample.getContext("2d", { willReadFrequently: true })!;
    let lastDetect = 0;

    const drawOverlay = (w: number, h: number) => {
      overlay.width = w;
      overlay.height = h;
      const octx = overlay.getContext("2d")!;
      octx.clearRect(0, 0, w, h);
      const corners = cornersRef.current;
      if (!corners) return;

      octx.strokeStyle = "rgba(59, 130, 246, 0.95)";
      octx.fillStyle = "rgba(59, 130, 246, 0.12)";
      octx.lineWidth = Math.max(3, w / 400);
      octx.beginPath();
      octx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i++) octx.lineTo(corners[i].x, corners[i].y);
      octx.closePath();
      octx.fill();
      octx.stroke();

      for (const c of corners) {
        octx.beginPath();
        octx.arc(c.x, c.y, 14, 0, Math.PI * 2);
        octx.fillStyle = "#3b82f6";
        octx.fill();
        octx.strokeStyle = "#fff";
        octx.lineWidth = 3;
        octx.stroke();
      }
    };

    const loop = (ts: number) => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w && h) {
        videoSizeRef.current = { w, h };

        if (!manualLockRef.current && ts - lastDetect > 180) {
          lastDetect = ts;
          const sw = 400;
          const sh = Math.round((h / w) * sw);
          sample.width = sw;
          sample.height = sh;
          sampleCtx.drawImage(video, 0, 0, sw, sh);
          const img = sampleCtx.getImageData(0, 0, sw, sh);
          const detected = detectDocumentEdges(img, sw, sh);

          if (detected && detected.confidence >= 0.28) {
            const scaleX = w / sw;
            const scaleY = h / sh;
            const scaled = detected.quad.map((p: Point) => ({
              x: p.x * scaleX,
              y: p.y * scaleY,
            })) as Quad;

            // Temporal smoothing — less flicker, more CamScanner-like lock
            const hist = smoothHistoryRef.current;
            hist.push(scaled);
            if (hist.length > 4) hist.shift();
            const smoothed = hist[0].map((_, i) => {
              let sx = 0;
              let sy = 0;
              for (const q of hist) {
                sx += q[i].x;
                sy += q[i].y;
              }
              return { x: sx / hist.length, y: sy / hist.length };
            }) as Quad;

            cornersRef.current = smoothed;
            setLiveCorners(smoothed);
            setEdgeConfidence(detected.confidence);
          } else {
            smoothHistoryRef.current = [];
            cornersRef.current = defaultQuad(w, h, 0.06);
            setLiveCorners(cornersRef.current);
            setEdgeConfidence(detected?.confidence ?? 0);
          }
        } else if (!cornersRef.current) {
          cornersRef.current = fullFrameQuad(w, h);
          setLiveCorners(cornersRef.current);
        }

        drawOverlay(w, h);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready, edgeDetection]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

    // Keep user-adjusted corners (drag / Full Page) — don't overwrite on shutter
    if (manualLockRef.current && cornersRef.current) {
      onCapture(dataUrl, cornersRef.current);
      return;
    }

    // CamScanner-style: re-detect on the still frame at higher quality
    const refined = detectCornersFromCanvas(canvas, 0.32);
    cornersRef.current = refined.quad;
    setLiveCorners(refined.quad);
    setEdgeConfidence(refined.confidence);
    onCapture(dataUrl, refined.quad);
  };

  const flip = () =>
    setFacingMode((m) => (m === "environment" ? "user" : "environment"));

  const resumeAutoDetect = () => {
    manualLockRef.current = false;
    setManualLock(false);
    smoothHistoryRef.current = [];
  };

  if (error) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 text-center space-y-3",
          className
        )}
        dir="rtl"
      >
        <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{error}</p>
        <p className="text-xs text-[var(--fg-muted)]">
          אפשר להמשיך עם העלאת קובץ למטה — המצלמה אינה חובה.
        </p>
        <button
          type="button"
          onClick={() => void startCamera()}
          className="text-sm text-teal-300 underline underline-offset-4"
        >
          {he.camera.retry}
        </button>
      </div>
    );
  }

  const edgeLabel = manualLock
    ? he.camera.manual
    : edgeConfidence != null && edgeConfidence >= EDGE_CONFIDENCE_MIN
      ? he.camera.edge
      : he.camera.fullFrameHint;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-black aspect-[3/4] sm:aspect-[4/3] max-h-[min(48dvh,380px)] sm:max-h-none",
        className
      )}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full object-cover touch-none cursor-crosshair"
        onPointerDown={onOverlayPointerDown}
        onPointerMove={onOverlayPointerMove}
        onPointerUp={onOverlayPointerUp}
        onPointerCancel={onOverlayPointerUp}
      />
      <canvas ref={canvasRef} className="hidden" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--ink)] text-[var(--fg-muted)] text-sm">
          {he.camera.starting}
        </div>
      )}

      <div className="absolute inset-x-0 top-0 p-3 flex justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent">
        <button
          type="button"
          onClick={applyFullPage}
          disabled={!ready}
          className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-white/25 disabled:opacity-40"
        >
          {he.camera.fullPage}
        </button>
        {manualLock && (
          <button
            type="button"
            onClick={resumeAutoDetect}
            className="rounded-full bg-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-100 backdrop-blur hover:bg-blue-500/45"
          >
            {he.camera.resumeAuto}
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <p className="mb-2 text-center text-[10px] tracking-wide text-white/70">
          {he.camera.dragHint}
        </p>
        <div className="flex items-center justify-center gap-6 sm:gap-8">
          <button
            type="button"
            onClick={flip}
            className="text-xs tracking-widest text-white/70 hover:text-white"
          >
            {he.camera.flip}
          </button>
          <button
            type="button"
            aria-label={he.camera.capture}
            onClick={capture}
            disabled={!ready}
            className="h-16 w-16 rounded-full bg-white border-[3px] border-blue-400 shadow-[0_0_0_4px_rgba(255,255,255,0.12)] disabled:opacity-40 transition-transform active:scale-95"
          />
          <span className="min-w-12 text-center text-[10px] tracking-widest text-blue-200/90">
            {liveCorners ? edgeLabel : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
