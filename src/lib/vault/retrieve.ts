import { listPendingBills } from "@/lib/bills/alerts";
import {
  listPersonalDocuments,
  searchPersonalDocuments,
} from "@/lib/vault/documents";
import type {
  BillAlert,
  PersonalDocument,
  RetrieveDocumentCard,
  RetrieveResult,
} from "@/lib/types";
import { docTypeHe } from "@/lib/i18n/he";

const EXPIRING_SOON_DAYS = 60;

/** Map Hebrew / Latin query fragments → search keywords */
const QUERY_HINTS: Array<{ match: RegExp; keywords: string[] }> = [
  {
    match: /דרכון|passport/i,
    keywords: ["passport", "דרכון", "Passport"],
  },
  {
    match: /תעודת\s*זהות|ת\.ז|תז|id\s*card|זהות/i,
    keywords: ["ID_Card", "זהות", "תעודה", "ID"],
  },
  {
    match: /רישיון\s*נהיגה|נהיגה|driver/i,
    keywords: ["Driver_License", "נהיגה", "רישיון"],
  },
  {
    match: /רישיון\s*רכב|רכב|car\s*license|טסט/i,
    keywords: ["Car_License", "רכב", "רישיון"],
  },
  {
    match: /ביטוח|insurance/i,
    keywords: ["Insurance", "ביטוח"],
  },
  {
    match: /תעודה|certificate|תעודת/i,
    keywords: ["Certificate", "תעודה"],
  },
  {
    match: /חשבון|חשבונית|bill|invoice|לתשלום/i,
    keywords: ["bill", "חשבון", "חשבונית"],
  },
];

function extractKeywords(query: string): string[] {
  const keywords = new Set<string>();
  for (const hint of QUERY_HINTS) {
    if (hint.match.test(query)) {
      hint.keywords.forEach((k) => keywords.add(k));
    }
  }

  // Free-text tokens (Hebrew/Latin words length >= 2)
  const tokens = query
    .split(/[\s,.!?;:'"־\-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const stop = new Set([
    "את",
    "של",
    "לי",
    "מה",
    "איפה",
    "תביא",
    "תשלח",
    "תראה",
    "הצג",
    "בבקשה",
    "אני",
    "הכספת",
    "מסמך",
    "צילום",
    "קובץ",
    "מספר",
  ]);

  for (const t of tokens) {
    if (!stop.has(t.toLowerCase())) keywords.add(t);
  }

  return [...keywords];
}

function expirationFlags(dateStr: string | null): {
  expired: boolean;
  expiring_soon: boolean;
} {
  if (!dateStr) return { expired: false, expiring_soon: false };
  const exp = new Date(dateStr);
  if (Number.isNaN(exp.getTime())) return { expired: false, expiring_soon: false };
  const now = new Date();
  const ms = exp.getTime() - now.getTime();
  const days = ms / 86400000;
  return {
    expired: days < 0,
    expiring_soon: days >= 0 && days <= EXPIRING_SOON_DAYS,
  };
}

function toVaultCard(doc: PersonalDocument): RetrieveDocumentCard {
  const flags = expirationFlags(doc.expiration_date);
  return {
    id: doc.id,
    title: doc.title,
    doc_type: doc.doc_type,
    document_number: doc.document_number,
    expiration_date: doc.expiration_date,
    expired: flags.expired,
    expiring_soon: flags.expiring_soon,
    file_url: doc.file_url,
    file_id: doc.file_id,
    summary: doc.summary,
    source: "vault",
  };
}

function toBillCard(bill: BillAlert): RetrieveDocumentCard {
  const flags = expirationFlags(bill.due_date);
  return {
    id: bill.id,
    title: `חשבון — ${bill.vendor}`,
    doc_type: "Bill",
    document_number:
      bill.amount != null ? `₪${Number(bill.amount).toFixed(2)}` : null,
    expiration_date: bill.due_date,
    expired: flags.expired,
    expiring_soon: flags.expiring_soon,
    file_url: bill.original_bill_url,
    file_id: bill.original_bill_file_id,
    summary: `סטטוס: ${bill.status === "PENDING_PAYMENT" ? "ממתין לתשלום" : "שולם"}`,
    source: "bill",
  };
}

function wantsBills(query: string): boolean {
  return /חשבון|חשבונית|bill|invoice|לתשלום|תשלום/i.test(query);
}

function buildAnswer(
  query: string,
  documents: RetrieveDocumentCard[]
): string {
  if (documents.length === 0) {
    return `לא מצאתי מסמך מתאים בכספת לשאילתה "${query}". נסו מילים כמו דרכון, רישיון נהיגה, ביטוח רכב — או סרקו מסמך חדש לכספת.`;
  }

  if (documents.length === 1) {
    const d = documents[0];
    const typeLabel = docTypeHe(d.doc_type);
    let ans = `מצאתי את ${d.title} (${typeLabel}).`;
    if (d.document_number && d.source === "vault") {
      ans += ` מספר המסמך: ${d.document_number}.`;
    }
    if (d.expiration_date) {
      if (d.expired) {
        ans += ` ⚠️ שים לב: תוקף פג ב־${d.expiration_date}.`;
      } else if (d.expiring_soon) {
        ans += ` תוקף עד ${d.expiration_date} (מתקרב לסיום).`;
      } else {
        ans += ` תוקף עד ${d.expiration_date}.`;
      }
    }
    return ans;
  }

  return `מצאתי ${documents.length} מסמכים רלוונטיים בכספת. בחרו כרטיס לצפייה או הורדה.`;
}

export async function retrieveFromVault(query: string): Promise<RetrieveResult> {
  const q = query.trim();
  if (!q) {
    return {
      answer: "כתבו מה לשלוף מהכספת — למשל: צילום דרכון, רישיון נהיגה, ביטוח רכב.",
      documents: [],
    };
  }

  const keywords = extractKeywords(q);
  let vaultDocs: PersonalDocument[] = [];

  try {
    vaultDocs =
      keywords.length > 0
        ? await searchPersonalDocuments(keywords)
        : await listPersonalDocuments();
  } catch (e) {
    console.warn("[retrieve] vault search:", e);
    vaultDocs = [];
  }

  // If keyword search too narrow and empty, fall back to full list filtered lightly
  if (vaultDocs.length === 0 && keywords.length > 0) {
    try {
      const all = await listPersonalDocuments();
      vaultDocs = all.filter((doc) => {
        const hay = `${doc.title} ${doc.summary} ${doc.doc_type}`.toLowerCase();
        return keywords.some((k) => hay.includes(k.toLowerCase()));
      });
    } catch {
      /* ignore */
    }
  }

  const cards: RetrieveDocumentCard[] = vaultDocs.map(toVaultCard);

  if (wantsBills(q) || cards.length === 0) {
    try {
      const bills = await listPendingBills();
      const billCards = bills
        .filter((b) => {
          if (!wantsBills(q) && cards.length > 0) return false;
          const hay = `${b.vendor}`.toLowerCase();
          return (
            wantsBills(q) ||
            keywords.some((k) => hay.includes(k.toLowerCase()))
          );
        })
        .map(toBillCard);
      cards.push(...billCards);
    } catch (e) {
      console.warn("[retrieve] bills:", e);
    }
  }

  return {
    answer: buildAnswer(q, cards),
    documents: cards.slice(0, 12),
  };
}
