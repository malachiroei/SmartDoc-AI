"use client";

import { useState } from "react";
import Link from "next/link";
import { ScanLine, Sparkles, HardDrive, Mail } from "lucide-react";
import type { ExportFormat, ScannedPage } from "@/lib/types";
import { ScanWorkspace } from "@/components/scanner/ScanWorkspace";
import { PostScanModal } from "@/components/actions/PostScanModal";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  const [scanning, setScanning] = useState(false);
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [modalOpen, setModalOpen] = useState(false);

  const handleSave = (saved: ScannedPage[], fmt: ExportFormat) => {
    setPages(saved);
    setFormat(fmt);
    setModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--ink)]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300 border border-teal-400/30">
              <ScanLine className="h-4 w-4" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
              SmartDoc
              <span className="text-teal-400"> AI</span>
            </span>
          </Link>
          <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--fg-muted)] font-[family-name:var(--font-mono)]">
            Phase 1
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        {!scanning ? (
          <section className="animate-fade-in">
            <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 sm:p-12">
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
                  backgroundSize: "28px 28px",
                  maskImage:
                    "radial-gradient(ellipse at center, black 20%, transparent 75%)",
                }}
              />
              <div className="relative">
                <p className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 text-xs text-teal-200 mb-5">
                  <Sparkles className="h-3.5 w-3.5" />
                  CamScanner-quality · Drive & Email
                </p>
                <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl tracking-tight text-[var(--fg)] max-w-lg leading-[1.1]">
                  Scan. Enhance. File in one tap.
                </h1>
                <p className="mt-4 max-w-md text-[var(--fg-muted)] leading-relaxed">
                  Real-time edge detection, perspective correction, Magic Color
                  filters, and multi-page PDF — then save to Google Drive or
                  email instantly.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button size="lg" onClick={() => setScanning(true)}>
                    <ScanLine className="h-5 w-5" />
                    Start scanning
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-8 grid sm:grid-cols-3 gap-3">
              {[
                {
                  icon: ScanLine,
                  title: "Edge-aware capture",
                  body: "Live document boundaries with drag-to-adjust corners.",
                },
                {
                  icon: HardDrive,
                  title: "Google Drive",
                  body: "Quick folder picker defaults to last-used location.",
                },
                {
                  icon: Mail,
                  title: "Send via email",
                  body: "Autocomplete from recent recipients and contacts.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-4"
                >
                  <item.icon className="h-5 w-5 text-teal-300 mb-2" />
                  <h2 className="text-sm font-medium">{item.title}</h2>
                  <p className="mt-1 text-xs text-[var(--fg-muted)] leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="animate-slide-up">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="font-[family-name:var(--font-display)] text-2xl">
                Scanner
              </h1>
            </div>
            <ScanWorkspace
              onSave={handleSave}
              onCancel={() => setScanning(false)}
            />
          </section>
        )}
      </main>

      <PostScanModal
        open={modalOpen}
        pages={pages}
        format={format}
        onClose={() => setModalOpen(false)}
        onDone={() => {
          setScanning(false);
          setPages([]);
        }}
      />
    </div>
  );
}
