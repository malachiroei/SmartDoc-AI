"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Quad } from "@/lib/types";
import { detectDocumentEdges, defaultQuad } from "@/lib/image/perspective";
import { cn } from "@/lib/utils";
import { he } from "@/lib/i18n/he";

type Props = {
  onCapture: (dataUrl: string, corners: Quad) => void;
  edgeDetection?: boolean;
  className?: string;
};

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

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [liveCorners, setLiveCorners] = useState<Quad | null>(null);

  const stopStream = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopStream();
    setError(null);
    setReady(false);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
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

  useEffect(() => {
    if (!ready || !edgeDetection) return;

    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay) return;

    const sample = document.createElement("canvas");
    const sampleCtx = sample.getContext("2d", { willReadFrequently: true })!;
    let lastDetect = 0;

    const loop = (ts: number) => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w && h) {
        overlay.width = w;
        overlay.height = h;
        const octx = overlay.getContext("2d")!;
        octx.clearRect(0, 0, w, h);

        if (ts - lastDetect > 180) {
          lastDetect = ts;
          const sw = 320;
          const sh = Math.round((h / w) * sw);
          sample.width = sw;
          sample.height = sh;
          sampleCtx.drawImage(video, 0, 0, sw, sh);
          const img = sampleCtx.getImageData(0, 0, sw, sh);
          const detected = detectDocumentEdges(img, sw, sh);
          if (detected) {
            const scaleX = w / sw;
            const scaleY = h / sh;
            cornersRef.current = detected.map((p: Point) => ({
              x: p.x * scaleX,
              y: p.y * scaleY,
            })) as Quad;
            setLiveCorners(cornersRef.current);
          } else {
            cornersRef.current = defaultQuad(w, h, 0.1);
            setLiveCorners(cornersRef.current);
          }
        }

        const corners = cornersRef.current;
        if (corners) {
          octx.strokeStyle = "rgba(45, 212, 191, 0.95)";
          octx.fillStyle = "rgba(45, 212, 191, 0.12)";
          octx.lineWidth = Math.max(3, w / 400);
          octx.beginPath();
          octx.moveTo(corners[0].x, corners[0].y);
          for (let i = 1; i < 4; i++) octx.lineTo(corners[i].x, corners[i].y);
          octx.closePath();
          octx.fill();
          octx.stroke();

          for (const c of corners) {
            octx.beginPath();
            octx.arc(c.x, c.y, 10, 0, Math.PI * 2);
            octx.fillStyle = "#fff";
            octx.fill();
            octx.strokeStyle = "#2dd4bf";
            octx.lineWidth = 3;
            octx.stroke();
          }
        }
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
    const corners =
      cornersRef.current ?? defaultQuad(canvas.width, canvas.height);
    onCapture(dataUrl, corners);
  };

  const flip = () =>
    setFacingMode((m) => (m === "environment" ? "user" : "environment"));

  // Compact error card — does NOT dominate the page; upload/toggle stay visible outside
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

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-black aspect-[3/4] sm:aspect-[4/3]",
        className
      )}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
      />
      <canvas ref={canvasRef} className="hidden" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--ink)] text-[var(--fg-muted)] text-sm">
          {he.camera.starting}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
        <div className="flex items-center justify-center gap-8">
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
            className="h-16 w-16 rounded-full bg-white border-[3px] border-teal-400 shadow-[0_0_0_4px_rgba(255,255,255,0.12)] disabled:opacity-40 transition-transform active:scale-95"
          />
          <span className="w-12 text-center text-[10px] tracking-widest text-teal-300/90">
            {liveCorners ? he.camera.edge : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
