"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Mail,
  ScanLine,
  Shield,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import { GoogleConnectButtonLazy } from "./GoogleConnectButtonLazy";

export type NavHref = "/" | "/scan" | "/vault" | "/bills" | "/gmail";

const NAV_ITEMS: Array<{ href: NavHref; label: string; icon: LucideIcon }> = [
  { href: "/", label: he.tabs.home, icon: Home },
  { href: "/scan", label: he.tabs.scan, icon: ScanLine },
  { href: "/vault", label: he.tabs.vault, icon: Shield },
  { href: "/bills", label: he.tabs.bills, icon: Wallet },
  { href: "/gmail", label: he.tabs.gmail, icon: Mail },
];

function isActive(pathname: string, href: NavHref): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavbar() {
  const pathname = usePathname() || "/";

  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--ink)]/80 backdrop-blur-xl"
      dir="rtl"
    >
      <div className="mx-auto max-w-3xl px-4">
        <div className="h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300 border border-teal-400/30">
              <ScanLine className="h-4 w-4" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
              {he.appName}
              <span className="text-teal-400"> AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <GoogleConnectButtonLazy />
            <span className="hidden md:inline text-[10px] sm:text-[11px] tracking-wide text-[var(--fg-muted)] font-[family-name:var(--font-mono)] text-left shrink min-w-0 truncate">
              {he.phase}
            </span>
          </div>
        </div>

        <nav
          className="flex gap-1 pb-2 overflow-x-auto"
          aria-label="ניווט ראשי"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm whitespace-nowrap transition-colors border",
                  active
                    ? "bg-teal-400/15 text-teal-200 border-teal-400/30"
                    : "border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface)]"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
