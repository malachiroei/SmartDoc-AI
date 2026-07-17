"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Receipt,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import type { BillAlert } from "@/lib/types";
import { fetchBills } from "@/lib/bills/client";
import { he } from "@/lib/i18n/he";
import { Button } from "@/components/ui/Button";
import { PayBillModal } from "./PayBillModal";
import { cn } from "@/lib/utils";

type Filter = "all" | "pending" | "paid";

type Props = {
  refreshKey?: number;
  onPaid?: () => void;
};

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return `₪${Number(amount).toLocaleString("he-IL", { minimumFractionDigits: 2 })}`;
}

function formatDueDate(due: string | null): string {
  if (!due) return he.bills.noDueDate;
  try {
    return new Date(due).toLocaleDateString("he-IL");
  } catch {
    return due;
  }
}

function isOverdue(bill: BillAlert): boolean {
  if (bill.status !== "PENDING_PAYMENT" || !bill.due_date) return false;
  const due = new Date(bill.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export function PendingBillsDashboard({ refreshKey, onPaid }: Props) {
  const [bills, setBills] = useState<BillAlert[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payBill, setPayBill] = useState<BillAlert | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchBills(filter);
      setBills(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : he.bills.loadError);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const counts = useMemo(() => {
    const unpaid = bills.filter((b) => b.status === "PENDING_PAYMENT").length;
    const paid = bills.filter((b) => b.status === "PAID_AND_ARCHIVED").length;
    return { unpaid, paid, total: bills.length };
  }, [bills]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[var(--fg-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" /> טוען חשבונות…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-200">
        {error}
        <Button variant="secondary" className="mt-4" onClick={() => void load()}>
          ניסיון חוזר
        </Button>
      </div>
    );
  }

  const filters: Array<{ id: Filter; label: string }> = [
    { id: "all", label: he.bills.filterAll },
    { id: "pending", label: he.bills.filterUnpaid },
    { id: "paid", label: he.bills.filterPaid },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            {he.bills.title}
          </h2>
          <p className="text-sm text-[var(--fg-muted)]">{he.bills.subtitle}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm transition-colors",
              filter === f.id
                ? "border-amber-400/40 bg-amber-400/15 text-amber-100"
                : "border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter === "all" && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2">
            <span className="text-[var(--fg-muted)]">{he.bills.statusUnpaid}: </span>
            <strong>{counts.unpaid}</strong>
          </div>
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2">
            <span className="text-[var(--fg-muted)]">{he.bills.statusPaid}: </span>
            <strong>{counts.paid}</strong>
          </div>
        </div>
      )}

      {bills.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-[var(--fg-muted)]">
          {filter === "pending" ? he.bills.emptyPending : he.bills.empty}
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map((bill) => {
            const unpaid = bill.status === "PENDING_PAYMENT";
            const overdue = isOverdue(bill);
            return (
              <div
                key={bill.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-lg text-[var(--fg)]">
                        {bill.vendor}
                      </p>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium",
                          unpaid
                            ? "border-amber-400/40 bg-amber-400/15 text-amber-100"
                            : "border-emerald-400/40 bg-emerald-400/15 text-emerald-100"
                        )}
                      >
                        {unpaid ? (
                          <>
                            <AlertTriangle className="h-3 w-3" />
                            {he.bills.statusUnpaid}
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            {he.bills.statusPaid}
                          </>
                        )}
                      </span>
                      {overdue && (
                        <span className="rounded-lg border border-red-400/40 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-200">
                          {he.bills.overdue}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-amber-200 font-semibold">
                        <Receipt className="h-4 w-4" />
                        {formatAmount(bill.amount)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          overdue
                            ? "text-red-300 font-semibold"
                            : "text-[var(--fg-muted)]"
                        )}
                      >
                        <Calendar className="h-4 w-4" />
                        {he.bills.dueDate}: {formatDueDate(bill.due_date)}
                      </span>
                    </div>
                    {bill.original_bill_url && (
                      <a
                        href={bill.original_bill_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-teal-300 hover:underline"
                      >
                        {he.bills.viewBill}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {unpaid && (
                    <Button
                      className="shrink-0"
                      onClick={() => setPayBill(bill)}
                    >
                      {he.bills.markPaid}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PayBillModal
        bill={payBill}
        onClose={() => setPayBill(null)}
        onPaid={() => {
          setPayBill(null);
          void load();
          onPaid?.();
        }}
      />
    </div>
  );
}
