"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Quad } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  imageSrc: string;
  corners: Quad;
  onChange: (corners: Quad) => void;
  className?: string;
};

export function PerspectiveEditor({
  imageSrc,
  corners,
  onChange,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
      className={cn("relative touch-none select-none overflow-hidden rounded-xl bg-black", className)}
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
        className="block w-full h-auto max-h-[55vh] object-contain mx-auto"
        draggable={false}
      />
      <svg className="absolute inset-0 h-full w-full pointer-events-none">
        <polygon
          points={displayCorners.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(45,212,191,0.15)"
          stroke="#2dd4bf"
          strokeWidth="2"
        />
      </svg>
      {displayCorners.map((p, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Corner ${labels[i]}`}
          className="absolute z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-teal-400 bg-white shadow-lg cursor-grab active:cursor-grabbing"
          style={{ left: p.x, top: p.y }}
          onPointerDown={onPointerDown(i)}
        />
      ))}
    </div>
  );
}
