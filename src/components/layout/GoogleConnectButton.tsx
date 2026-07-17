"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HardDrive, Loader2, LogOut } from "lucide-react";
import {
  disconnectGoogle,
  fetchGoogleAuthStatus,
  startGoogleOAuth,
  type GoogleAuthStatus,
} from "@/lib/google/client";
import { he } from "@/lib/i18n/he";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  compact?: boolean;
};

export function GoogleConnectButton({ className, compact }: Props) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState<GoogleAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchGoogleAuthStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Handle return from OAuth callback (?google_connected=1 / ?google_error=...)
  useEffect(() => {
    const connected = searchParams.get("google_connected");
    const error = searchParams.get("google_error");
    if (!connected && !error) return;

    if (connected === "1") {
      toast(he.google.connected, "success");
      void refresh();
    } else if (error) {
      toast(he.google.connectError(error), "default");
    }

    const next = new URLSearchParams(searchParams.toString());
    next.delete("google_connected");
    next.delete("google_error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, pathname, router, toast, refresh]);

  if (loading) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]",
          className
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {!compact && he.google.checking}
      </span>
    );
  }

  // Secrets missing — show muted hint only
  if (status && !status.configured) {
    return (
      <span
        className={cn(
          "hidden sm:inline text-[10px] text-[var(--fg-muted)] truncate max-w-[9rem]",
          className
        )}
        title={he.google.notConfigured}
      >
        {he.google.notConfiguredShort}
      </span>
    );
  }

  if (status?.authenticated) {
    return (
      <button
        type="button"
        disabled={busy}
        title={he.google.disconnect}
        onClick={async () => {
          setBusy(true);
          try {
            await disconnectGoogle();
            toast(he.google.disconnected, "default");
            await refresh();
          } finally {
            setBusy(false);
          }
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] sm:text-xs text-emerald-200 hover:bg-emerald-400/20 transition-colors",
          className
        )}
      >
        <HardDrive className="h-3.5 w-3.5" />
        {compact ? he.google.connectedShort : he.google.connectedLabel}
        <LogOut className="h-3 w-3 opacity-70" />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        startGoogleOAuth(pathname);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border border-sky-400/40 bg-sky-400/15 px-2.5 py-1.5 text-[11px] sm:text-xs font-medium text-sky-100 hover:bg-sky-400/25 transition-colors",
        className
      )}
    >
      <HardDrive className="h-3.5 w-3.5" />
      {he.google.connect}
    </button>
  );
}
