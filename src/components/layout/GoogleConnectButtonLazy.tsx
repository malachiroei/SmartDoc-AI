"use client";

import { Suspense } from "react";
import { GoogleConnectButton } from "./GoogleConnectButton";

/** Suspense boundary required for useSearchParams in App Router */
export function GoogleConnectButtonLazy() {
  return (
    <Suspense
      fallback={
        <span className="text-[11px] text-[var(--fg-muted)]">…</span>
      }
    >
      <GoogleConnectButton />
    </Suspense>
  );
}
