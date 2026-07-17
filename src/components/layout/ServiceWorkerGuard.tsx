"use client";

import { useEffect } from "react";

/**
 * Unregisters broken / leftover Service Workers (e.g. missing /sw.js)
 * that intercept navigations and throw:
 *   Failed to convert value to 'Response'
 */
export function ServiceWorkerGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const cleanup = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (e) {
        console.warn("[sw-guard] cleanup failed:", e);
      }
    };

    void cleanup();
  }, []);

  return null;
}
