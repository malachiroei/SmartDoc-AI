"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ExportFormat, ScannedPage } from "@/lib/types";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { ScanWorkspace } from "@/components/scanner/ScanWorkspace";
import { PostScanOrchestrator } from "@/components/actions/PostScanOrchestrator";
import { he } from "@/lib/i18n/he";

function ScanPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kindParam = searchParams.get("kind");
  const defaultScanKind =
    kindParam === "personal" || kindParam === "vault" ? "personal" : "document";

  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <section className="animate-slide-up" dir="rtl">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="font-[family-name:var(--font-display)] text-2xl">
              {he.scanner.title}
            </h1>
          </div>
          <ScanWorkspace
            defaultScanKind={defaultScanKind}
            onSave={(saved, fmt) => {
              setPages(saved);
              setFormat(fmt);
              setModalOpen(true);
            }}
            onCancel={() => router.push("/")}
          />
        </section>
      </main>

      <PostScanOrchestrator
        open={modalOpen}
        pages={pages}
        format={format}
        onClose={() => setModalOpen(false)}
        onDone={() => {
          setPages([]);
          router.push(defaultScanKind === "personal" ? "/vault" : "/");
        }}
      />
    </>
  );
}

export default function ScanPage() {
  return (
    <div className="flex-1 flex flex-col" dir="rtl">
      <AppNavbar />
      <Suspense
        fallback={
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 text-[var(--fg-muted)]">
            טוען סורק…
          </main>
        }
      >
        <ScanPageInner />
      </Suspense>
    </div>
  );
}
