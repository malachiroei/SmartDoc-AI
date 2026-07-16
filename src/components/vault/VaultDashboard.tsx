"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Shield, ScanLine } from "lucide-react";
import type { PersonalDocument, RetrieveDocumentCard, RetrieveResult } from "@/lib/types";
import {
  deleteVaultDocument,
  fetchVaultDocuments,
  retrieveFromAgent,
} from "@/lib/vault/client";
import { he } from "@/lib/i18n/he";
import { Button } from "@/components/ui/Button";
import { VaultDocumentCard } from "./VaultDocumentCard";
import { VaultPreviewModal } from "./VaultPreviewModal";

type Props = {
  refreshKey?: number;
};

function toCard(doc: PersonalDocument): RetrieveDocumentCard {
  const leaky =
    /חשבונית|invoice|דמו/i.test(doc.title) ||
    /חשבונית|invoice/i.test(doc.summary ?? "");
  const title =
    leaky || !doc.title
      ? ({
          Driver_License: "רישיון נהיגה - מדינת ישראל",
          Passport: "דרכון - מדינת ישראל",
          ID_Card: "תעודת זהות - מדינת ישראל",
          Car_License: "רישיון רכב - מדינת ישראל",
        }[doc.doc_type] ?? doc.title)
      : doc.title;

  const exp = doc.expiration_date ? new Date(doc.expiration_date) : null;
  const now = new Date();
  const days = exp ? (exp.getTime() - now.getTime()) / 86400000 : null;
  return {
    id: doc.id,
    title,
    doc_type: doc.doc_type,
    document_number: doc.document_number,
    expiration_date: doc.expiration_date,
    expired: days != null && days < 0,
    expiring_soon: days != null && days >= 0 && days <= 60,
    file_url: doc.file_url,
    file_id: doc.file_id,
    summary: leaky ? title : doc.summary,
    source: "vault",
  };
}

function categorize(doc: PersonalDocument): keyof typeof he.vault.categories {
  const t = doc.doc_type;
  if (t === "ID_Card" || t === "Passport" || t === "ID") return "identity";
  if (t === "Driver_License" || t === "Car_License") return "licenses";
  if (t === "Insurance" || t === "Certificate") return "insurance";
  return "other";
}

const CATEGORY_ORDER: Array<keyof typeof he.vault.categories> = [
  "identity",
  "licenses",
  "insurance",
  "other",
];

export function VaultDashboard({ refreshKey }: Props) {
  const [docs, setDocs] = useState<PersonalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<RetrieveResult | null>(null);
  const [preview, setPreview] = useState<RetrieveDocumentCard | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchVaultDocuments();
      setDocs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : he.vault.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const grouped = useMemo(() => {
    const map: Record<string, PersonalDocument[]> = {};
    for (const cat of CATEGORY_ORDER) map[cat] = [];
    for (const doc of docs) {
      map[categorize(doc)].push(doc);
    }
    return map;
  }, [docs]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await retrieveFromAgent(q);
      setResult(res);
    } catch (e) {
      setResult({
        answer: e instanceof Error ? e.message : he.vault.retrieveError,
        documents: [],
      });
    } finally {
      setSearching(false);
    }
  };

  const handleView = useCallback((doc: RetrieveDocumentCard) => {
    setPreview(doc);
  }, []);

  const handleDelete = useCallback(async (doc: RetrieveDocumentCard) => {
    if (doc.source === "bill") return;
    const prev = docs;
    setDeletingId(doc.id);
    // Optimistic UI — remove immediately
    setDocs((d) => d.filter((x) => x.id !== doc.id));
    setResult((r) =>
      r
        ? { ...r, documents: r.documents.filter((x) => x.id !== doc.id) }
        : r
    );
    if (preview?.id === doc.id) setPreview(null);

    try {
      await deleteVaultDocument(doc.id);
    } catch (e) {
      setDocs(prev);
      setError(e instanceof Error ? e.message : he.vault.deleteError);
    } finally {
      setDeletingId(null);
    }
  }, [docs, preview?.id]);

  return (
    <div className="space-y-8" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl">
              {he.vault.title}
            </h2>
            <p className="text-sm text-[var(--fg-muted)]">{he.vault.subtitle}</p>
          </div>
        </div>
        <Link href="/scan?kind=personal">
          <Button variant="secondary" size="sm">
            <ScanLine className="h-4 w-4" />
            סריקת תעודה לכספת
          </Button>
        </Link>
      </div>

      {/* AI Agent search */}
      <div className="rounded-2xl border border-emerald-400/25 bg-gradient-to-l from-emerald-400/10 to-transparent p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder={he.vault.searchPlaceholder}
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--ink)]/60 px-4 py-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] outline-none focus:border-emerald-400/50"
            dir="rtl"
          />
          <Button
            className="shrink-0"
            onClick={() => void runSearch()}
            disabled={searching || !query.trim()}
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {he.vault.searching}
              </>
            ) : (
              <>
                <Search className="h-4 w-4" /> {he.vault.search}
              </>
            )}
          </Button>
        </div>

        {result && (
          <div className="space-y-3 animate-fade-in">
            <p className="text-sm leading-relaxed text-[var(--fg)] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              {result.answer}
            </p>
            {result.documents.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {result.documents.map((d) => (
                  <VaultDocumentCard
                    key={`${d.source}-${d.id}`}
                    document={d}
                    onView={handleView}
                    onDelete={d.source === "vault" ? handleDelete : undefined}
                    deleting={deletingId === d.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vault grid */}
      <div className="space-y-4">
        <h3 className="font-medium text-[var(--fg)]">{he.vault.gridTitle}</h3>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-[var(--fg-muted)]">
            <Loader2 className="h-5 w-5 animate-spin" /> טוען כספת…
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-200">
            {error}
            <Button variant="secondary" className="mt-4" onClick={() => void load()}>
              ניסיון חוזר
            </Button>
          </div>
        )}

        {!loading && !error && docs.length === 0 && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-[var(--fg-muted)]">
            {he.vault.empty}
          </div>
        )}

        {!loading &&
          !error &&
          CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            if (!items?.length) return null;
            return (
              <div key={cat} className="space-y-3">
                <h4 className="text-sm font-semibold text-[var(--fg-muted)]">
                  {he.vault.categories[cat]}
                </h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  {items.map((doc) => (
                    <VaultDocumentCard
                      key={doc.id}
                      document={toCard(doc)}
                      onView={handleView}
                      onDelete={handleDelete}
                      deleting={deletingId === doc.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      <VaultPreviewModal
        document={preview}
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
