"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  className,
  wide,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <button
        aria-label="Close overlay"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl",
          "bg-[var(--surface)] border border-[var(--border)] shadow-2xl",
          "animate-slide-up",
          wide && "sm:max-w-2xl",
          className
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 pt-5 pb-3 bg-[var(--surface)]/95 backdrop-blur border-b border-[var(--border)]">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fg)] tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-[var(--fg-muted)]">{subtitle}</p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
