"use client";

import { useState } from "react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { PendingBillsDashboard } from "@/components/bills/PendingBillsDashboard";

export default function BillsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex-1 flex flex-col" dir="rtl">
      <AppNavbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
        <section className="animate-fade-in">
          <PendingBillsDashboard
            refreshKey={refreshKey}
            onPaid={() => setRefreshKey((k) => k + 1)}
          />
        </section>
      </main>
    </div>
  );
}
