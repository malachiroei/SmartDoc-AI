"use client";

import { AppNavbar } from "@/components/layout/AppNavbar";
import { DriveInboxPanel } from "@/components/drive/DriveInboxPanel";
import { he } from "@/lib/i18n/he";

export default function ScanPage() {
  return (
    <div className="flex-1 flex flex-col" dir="rtl">
      <AppNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-3 py-3 sm:px-4 sm:py-6">
        <section className="animate-slide-up space-y-4" dir="rtl">
          <h1 className="font-[family-name:var(--font-display)] text-lg sm:text-2xl">
            {he.scanner.title}
          </h1>
          <DriveInboxPanel />
        </section>
      </main>
    </div>
  );
}
