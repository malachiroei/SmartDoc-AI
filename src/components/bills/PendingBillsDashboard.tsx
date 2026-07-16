"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  ExternalLink,
  Loader2,
  Receipt,
  Wallet,
} from "lucide-react";
import type { BillAlert } from "@/lib/types";
import { fetchPendingBills } from "@/lib/bills/client";
import { he } from "@/lib/i18n/he";
import { Button } from "@/components/ui/Button";
import { PayBillModal } from "./PayBillModal";

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

export function PendingBillsDashboard({ refreshKey, onPaid }: Props) {
  const [bills, setBills] = useState<BillAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payBill, setPayBill] = useState<BillAlert | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPendingBills();
      setBills(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : he.bills.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

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

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            {he.bills.title}
          </h2>
          <p className="text-sm text-[var(--fg-muted)]">
            {bills.length} חשבונות ממתינים לתשלום
          </p>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-[var(--fg-muted)]">
          {he.bills.empty}
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map((bill) => (
            <div
              key={bill.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-lg text-[var(--fg)]">
                    {bill.vendor}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-amber-200 font-semibold">
                      <Receipt className="h-4 w-4" />
                      {formatAmount(bill.amount)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[var(--fg-muted)]">
                      <Calendar className="h-4 w-4" />
                      {formatDueDate(bill.due_date)}
                    </span>
                  </div>
                  {bill.original_bill_url && (
                    <a
                      href={bill.original_bill_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-teal-300 hover:underline"
                    >
                      {he.bills.viewBill}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <Button
                  className="shrink-0"
                  onClick={() => setPayBill(bill)}
                >
                  {he.bills.markPaid}
                </Button>
              </div>
            </div>
          ))}
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
