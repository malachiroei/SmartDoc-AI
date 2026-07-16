"use client";

import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import type { BillAlert } from "@/lib/types";
import { payBillWithReceipt } from "@/lib/bills/client";
import { he } from "@/lib/i18n/he";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  bill: BillAlert | null;
  onClose: () => void;
  onPaid: () => void;
};

export function PayBillModal({ bill, onClose, onPaid }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || !bill) return;
    setBusy(true);
    try {
      const result = await payBillWithReceipt(bill.id, file);
      toast(result.message || he.bills.paidToast, "success");
      onPaid();
    } catch (e) {
      toast(e instanceof Error ? e.message : he.bills.payError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!bill}
      onClose={onClose}
      title={he.bills.payTitle}
      subtitle={bill ? he.bills.paySubtitle(bill.vendor) : undefined}
    >
      <div className="space-y-4" dir="rtl">
        <label
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[var(--border)] p-8 cursor-pointer hover:border-teal-400/50 transition-colors ${
            busy ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          <Upload className="h-8 w-8 text-teal-300" />
          <span className="text-sm font-medium">{he.bills.uploadReceipt}</span>
          <input
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void handleFile(f);
            }}
          />
        </label>

        {busy && (
          <div className="flex items-center justify-center gap-2 text-sm text-[var(--fg-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> {he.bills.paying}
          </div>
        )}

        <Button variant="secondary" className="w-full" onClick={onClose} disabled={busy}>
          ביטול
        </Button>
      </div>
    </Modal>
  );
}
