"use client";

import Link from "next/link";
import { ScanLine, Sparkles, Brain, HardDrive, Shield } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/Button";
import { he } from "@/lib/i18n/he";

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col" dir="rtl">
      <AppNavbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
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
                {he.home.badge}
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl tracking-tight text-[var(--fg)] max-w-lg leading-[1.15]">
                {he.home.title}
              </h1>
              <p className="mt-4 max-w-md text-[var(--fg-muted)] leading-relaxed">
                {he.home.subtitle}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/scan">
                  <Button size="lg">
                    <ScanLine className="h-5 w-5" />
                    {he.home.startScan}
                  </Button>
                </Link>
                <Link href="/vault">
                  <Button size="lg" variant="secondary">
                    <Shield className="h-5 w-5" />
                    {he.tabs.vault}
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-8 grid sm:grid-cols-3 gap-3">
            {[
              {
                icon: Brain,
                title: he.home.featureClassify,
                body: he.home.featureClassifyBody,
              },
              {
                icon: HardDrive,
                title: he.home.featureRoute,
                body: he.home.featureRouteBody,
              },
              {
                icon: Sparkles,
                title: he.home.featureStrike,
                body: he.home.featureStrikeBody,
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
      </main>
    </div>
  );
}
