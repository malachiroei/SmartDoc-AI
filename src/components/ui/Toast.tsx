"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type ToastItem = {
  id: string;
  message: string;
  variant?: "default" | "success" | "celebrate" | "auto";
};

type ToastContextValue = {
  toast: (message: string, variant?: ToastItem["variant"]) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (message: string, variant: ToastItem["variant"] = "default") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 5200);
    },
    []
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto max-w-md w-full rounded-2xl border px-4 py-3 text-sm shadow-2xl animate-slide-up backdrop-blur-xl",
              t.variant === "celebrate" &&
                "border-amber-400/40 bg-amber-500/15 text-amber-100",
              t.variant === "auto" &&
                "border-teal-400/40 bg-teal-500/15 text-teal-50",
              t.variant === "success" &&
                "border-emerald-400/40 bg-emerald-500/15 text-emerald-50",
              (!t.variant || t.variant === "default") &&
                "border-[var(--border)] bg-[var(--surface)]/95 text-[var(--fg)]"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
