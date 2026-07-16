"use client";

import { AppNavbar } from "@/components/layout/AppNavbar";
import { GmailIngestPanel } from "@/components/gmail/GmailIngestPanel";

export default function GmailPage() {
  return (
    <div className="flex-1 flex flex-col" dir="rtl">
      <AppNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <section className="animate-fade-in">
          <GmailIngestPanel />
        </section>
      </main>
    </div>
  );
}
