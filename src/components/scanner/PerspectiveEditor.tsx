"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Quad } from "@/lib/types";
import { LOCK_CONFIDENCE } from "@/lib/image/perspective";
import { cn } from "@/lib/utils";

type Props = {
  imageSrc: string;
  corners: Quad;
  onChange: (corners: Quad) => void;
  /** 0–1 detection confidence — teal when locked */
  confidence?: number;
  className?: string;
};

export function PerspectiveEditor({
  imageSrc,
  corners,
  onChange,
  confidence = 0,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const locked = confidence >= LOCK_CONFIDENCE;
  const stroke = locked ? "#2dd4bf" : "#3b82f6";
  const fill = locked ? "rgba(45,212,191,0.16)" : "rgba(59,130,246,0.14)";
  const handle = locked ? "bg-teal-400" : "bg-blue-500";

  const syncSize = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setSize({ w: img.clientWidth, h: img.clientHeight });
  }, []);

  useEffect(() => {
    syncSize();
    window.addEventListener("resize", syncSize);
    return () => window.removeEventListener("resize", syncSize);
  }, [syncSize, imageSrc]);

  const natural = {
    w: imgRef.current?.naturalWidth || 1,
    h: imgRef.current?.naturalHeight || 1,
  };

  const toDisplay = (p: Point): Point => ({
    x: (p.x / natural.w) * size.w,
    y: (p.y / natural.h) * size.h,
  });

  const toNatural = (p: Point): Point => ({
    x: (p.x / size.w) * natural.w,
    y: (p.y / size.h) * natural.h,
  });

  const displayCorners = corners.map(toDisplay) as Quad;

  const onPointerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragIndex(index);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(size.w, e.clientX - rect.left));
    const y = Math.max(0, Math.min(size.h, e.clientY - rect.top));
    const next = [...corners] as Quad;
    next[dragIndex] = toNatural({ x, y });
    onChange(next);
  };

  const onPointerUp = () => setDragIndex(null);

  const labels = ["TL", "TR", "BR", "BL"];

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative touch-none select-none overflow-hidden rounded-xl bg-black",
        className
      )}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt="Scan crop"
        onLoad={syncSize}
        className="block w-full h-auto max-h-[min(38dvh,280px)] sm:max-h-[55vh] object-contain mx-auto"
        draggable={false}
      />
      <svg className="absolute inset-0 h-full w-full pointer-events-none">
        <polygon
          points={displayCorners.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={fill}
          stroke={stroke}
          strokeWidth="2.5"
          strokeDasharray={locked ? undefined : "8 5"}
        />
      </svg>
      {displayCorners.map((p, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Corner ${labels[i]}`}
          className={cn(
            "absolute z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg cursor-grab active:cursor-grabbing touch-none",
            handle
          )}
          style={{ left: p.x, top: p.y }}
          onPointerDown={onPointerDown(i)}
        />
      ))}
    </div>
  );
}
