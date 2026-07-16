"use client";

import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "capture";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] shadow-lg shadow-[var(--accent)]/25",
  secondary:
    "bg-[var(--surface-2)] text-[var(--fg)] border border-[var(--border)] hover:bg-[var(--surface-3)]",
  ghost: "bg-transparent text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-white/5",
  danger: "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
  capture:
    "h-16 w-16 rounded-full bg-white border-[3px] border-[var(--accent)] shadow-[0_0_0_4px_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  ...props
}: Props) {
  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-lg gap-1.5",
    md: "px-4 py-2.5 text-sm rounded-xl gap-2",
    lg: "px-5 py-3 text-base rounded-xl gap-2",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all disabled:opacity-40 disabled:pointer-events-none",
        variant !== "capture" && sizes[size],
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
