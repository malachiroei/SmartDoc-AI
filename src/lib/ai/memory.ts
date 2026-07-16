import { getSupabase, checkSupabaseEnv } from "@/lib/supabase/client";
import { getGoogleAccessToken } from "@/lib/google/token";
import { PERSONAL_VAULT_FOLDER_HE } from "@/lib/ai/constants";
import type { ClassificationResult, DocType } from "@/lib/types";

export type FewShotExample = {
  source: "routing_rule" | "personal_document" | "feedback";
  vendor: string;
  doc_type: string;
  folder: string;
  summary?: string | null;
  priority: number;
  created_at: string;
};

export type ClassificationMemory = {
  examples: FewShotExample[];
  knownVendors: string[];
  knownFolders: string[];
  feedbackOverrides: FewShotExample[];
};

function isMissingTable(error: { message?: string } | null, table: string): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  return msg.includes(table.toLowerCase()) && msg.includes("could not find");
}

async function fetchRecentRoutingRules(): Promise<FewShotExample[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("routing_rules")
      .select(
        "vendor_or_doc_type, target_folder_name, confirmation_count, is_autonomous, last_triggered_at, created_at"
      )
      .order("last_triggered_at", { ascending: false })
      .limit(8);

    if (error) {
      if (isMissingTable(error, "routing_rules")) return [];
      console.warn("[ai/memory] routing_rules:", error.message);
      return [];
    }

    return (data ?? [])
      .filter((r) => (r.confirmation_count ?? 0) >= 1 || r.is_autonomous)
      .slice(0, 5)
      .map((r) => ({
        source: "routing_rule" as const,
        vendor: String(r.vendor_or_doc_type),
        doc_type: "Invoice",
        folder: String(r.target_folder_name),
        summary: null,
        priority: r.is_autonomous ? 8 : 5,
        created_at: String(r.last_triggered_at || r.created_at),
      }));
  } catch (e) {
    console.warn("[ai/memory] routing_rules failed:", e);
    return [];
  }
}

async function fetchRecentPersonalDocs(): Promise<FewShotExample[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("personal_documents")
      .select("doc_type, title, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      if (isMissingTable(error, "personal_documents")) return [];
      console.warn("[ai/memory] personal_documents:", error.message);
      return [];
    }

    return (data ?? []).map((d) => ({
      source: "personal_document" as const,
      vendor: "State_of_Israel",
      doc_type: String(d.doc_type),
      folder: PERSONAL_VAULT_FOLDER_HE,
      summary: d.summary || d.title,
      priority: 7,
      created_at: String(d.created_at),
    }));
  } catch (e) {
    console.warn("[ai/memory] personal_documents failed:", e);
    return [];
  }
}

async function fetchFeedbackLedger(): Promise<FewShotExample[]> {
  try {
    const supabase = getSupabase();

    // Prefer corrected_folder; fall back if column missing (older schemas)
    let rows: Array<Record<string, unknown>> | null = null;

    const primary = await supabase
      .from("ai_feedback_ledger")
      .select(
        "corrected_doc_type, corrected_vendor, corrected_folder, corrected_summary, is_personal_doc, priority, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(10);

    if (primary.error) {
      if (isMissingTable(primary.error, "ai_feedback_ledger")) return [];

      const missingFolderCol =
        /corrected_folder/i.test(primary.error.message) &&
        /does not exist/i.test(primary.error.message);

      if (missingFolderCol) {
        const fallback = await supabase
          .from("ai_feedback_ledger")
          .select(
            "corrected_doc_type, corrected_vendor, target_folder, corrected_summary, is_personal_doc, priority, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(10);

        if (fallback.error) {
          // Last resort: minimal columns
          const minimal = await supabase
            .from("ai_feedback_ledger")
            .select(
              "corrected_doc_type, corrected_vendor, corrected_summary, is_personal_doc, priority, created_at"
            )
            .order("created_at", { ascending: false })
            .limit(10);
          if (minimal.error) {
            console.warn("[ai/memory] ai_feedback_ledger:", minimal.error.message);
            return [];
          }
          rows = (minimal.data ?? []) as Array<Record<string, unknown>>;
        } else {
          rows = (fallback.data ?? []) as Array<Record<string, unknown>>;
        }
      } else {
        console.warn("[ai/memory] ai_feedback_ledger:", primary.error.message);
        return [];
      }
    } else {
      rows = (primary.data ?? []) as Array<Record<string, unknown>>;
    }

    return (rows ?? []).map((f) => {
      const isPersonal = Boolean(f.is_personal_doc);
      const folderRaw =
        f.corrected_folder ?? f.target_folder ?? f.folder ?? null;
      return {
        source: "feedback" as const,
        vendor: String(f.corrected_vendor ?? "Unknown"),
        doc_type: String(f.corrected_doc_type ?? "Other"),
        folder: isPersonal
          ? PERSONAL_VAULT_FOLDER_HE
          : String(folderRaw || PERSONAL_VAULT_FOLDER_HE),
        summary: (f.corrected_summary as string | null) ?? null,
        priority: Number(f.priority) || 10,
        created_at: String(f.created_at ?? ""),
      };
    });
  } catch (e) {
    console.warn("[ai/memory] feedback ledger failed:", e);
    return [];
  }
}

async function fetchDriveFolderNames(): Promise<string[]> {
  const token = getGoogleAccessToken();
  if (!token) {
    return [
      PERSONAL_VAULT_FOLDER_HE,
      "חשבונות לתשלום",
      "SmartDoc Scans",
      "חשבוניות",
    ];
  }

  try {
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.folder%27%20and%20trashed%3Dfalse&fields=files(name)&pageSize=40",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return [PERSONAL_VAULT_FOLDER_HE];
    const data = await res.json();
    const names = (data.files ?? [])
      .map((f: { name?: string }) => f.name)
      .filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
    if (!names.includes(PERSONAL_VAULT_FOLDER_HE)) {
      names.unshift(PERSONAL_VAULT_FOLDER_HE);
    }
    return names.slice(0, 40);
  } catch {
    return [PERSONAL_VAULT_FOLDER_HE];
  }
}

/** Deduplicate and pick top N examples by priority then recency */
function pickTopExamples(all: FewShotExample[], n = 5): FewShotExample[] {
  const seen = new Set<string>();
  const sorted = [...all].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.created_at.localeCompare(a.created_at);
  });

  const out: FewShotExample[] = [];
  for (const ex of sorted) {
    const key = `${ex.vendor}|${ex.doc_type}|${ex.folder}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ex);
    if (out.length >= n) break;
  }
  return out;
}

export async function loadClassificationMemory(): Promise<ClassificationMemory> {
  if (!checkSupabaseEnv().ok) {
    return {
      examples: [],
      knownVendors: [],
      knownFolders: [PERSONAL_VAULT_FOLDER_HE],
      feedbackOverrides: [],
    };
  }

  const [rules, personal, feedback, folders] = await Promise.all([
    fetchRecentRoutingRules(),
    fetchRecentPersonalDocs(),
    fetchFeedbackLedger(),
    fetchDriveFolderNames(),
  ]);

  const examples = pickTopExamples([...feedback, ...personal, ...rules], 5);
  const knownVendors = [
    ...new Set(
      [...feedback, ...rules, ...personal]
        .map((e) => e.vendor)
        .filter(Boolean)
    ),
  ].slice(0, 30);

  const knownFolders = [
    ...new Set([
      ...folders,
      ...examples.map((e) => e.folder),
      PERSONAL_VAULT_FOLDER_HE,
    ]),
  ].slice(0, 40);

  return {
    examples,
    knownVendors,
    knownFolders,
    feedbackOverrides: feedback.slice(0, 10),
  };
}

export function formatFewShotBlock(examples: FewShotExample[]): string {
  if (examples.length === 0) {
    return "(No verified user history yet — use general Israeli document rules.)";
  }

  return examples
    .map(
      (ex, i) =>
        `${i + 1}. Vendor: ${ex.vendor} -> Type: ${ex.doc_type} -> Folder: ${ex.folder}` +
        (ex.summary ? ` -> Summary: ${ex.summary}` : "") +
        ` [${ex.source}]`
    )
    .join("\n");
}

export function formatFeedbackOverrides(feedback: FewShotExample[]): string {
  if (feedback.length === 0) return "";

  const lines = feedback
    .slice(0, 8)
    .map(
      (f) =>
        `- STRICT OVERRIDE: vendor≈${f.vendor} MUST be classified as doc_type=${f.doc_type}, folder=${f.folder}`
    )
    .join("\n");

  return `\nUSER CORRECTION OVERRIDES (highest priority — obey exactly if document matches):\n${lines}\n`;
}

export type FeedbackInput = {
  original_doc_type?: string | null;
  original_vendor?: string | null;
  original_folder?: string | null;
  corrected_doc_type: string;
  corrected_vendor: string;
  corrected_folder?: string | null;
  corrected_summary?: string | null;
  is_personal_doc?: boolean;
  notes?: string | null;
};

export async function recordFeedback(
  input: FeedbackInput
): Promise<{ id: string } | null> {
  try {
    const supabase = getSupabase();
    const personal =
      input.is_personal_doc ||
      [
        "ID_Card",
        "Passport",
        "Driver_License",
        "Car_License",
        "Insurance",
        "Certificate",
        "ID",
      ].includes(input.corrected_doc_type);

    const row: Record<string, unknown> = {
      original_doc_type: input.original_doc_type ?? null,
      original_vendor: input.original_vendor ?? null,
      original_folder: input.original_folder ?? null,
      corrected_doc_type: input.corrected_doc_type,
      corrected_vendor: input.corrected_vendor.replace(/\s+/g, "_"),
      corrected_folder: personal
        ? PERSONAL_VAULT_FOLDER_HE
        : input.corrected_folder ?? null,
      corrected_summary: input.corrected_summary ?? null,
      is_personal_doc: personal,
      match_vendor: input.corrected_vendor.replace(/\s+/g, "_"),
      notes: input.notes ?? null,
      priority: 10,
    };

    let { data, error } = await supabase
      .from("ai_feedback_ledger")
      .insert(row)
      .select("id")
      .single();

    // Retry without corrected_folder if column missing
    if (
      error &&
      /corrected_folder/i.test(error.message) &&
      /does not exist/i.test(error.message)
    ) {
      const { corrected_folder: _drop, ...withoutFolder } = row;
      const retry = await supabase
        .from("ai_feedback_ledger")
        .insert({
          ...withoutFolder,
          // some schemas used target_folder instead
          target_folder: personal
            ? PERSONAL_VAULT_FOLDER_HE
            : input.corrected_folder ?? null,
        })
        .select("id")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isMissingTable(error, "ai_feedback_ledger")) {
        console.warn("[ai/feedback] table missing — run migration");
        return null;
      }
      throw new Error(error.message);
    }

    if (!data?.id) return null;
    return { id: data.id as string };
  } catch (e) {
    console.warn("[ai/feedback] record failed:", e);
    return null;
  }
}

/** Apply hard post-LLM overrides from feedback when vendor matches. */
export function applyFeedbackOverrides(
  result: ClassificationResult,
  feedback: FewShotExample[]
): ClassificationResult {
  if (feedback.length === 0) return result;

  const vendorKey = result.vendor.toLowerCase();
  const hit = feedback.find(
    (f) =>
      f.vendor.toLowerCase() === vendorKey ||
      vendorKey.includes(f.vendor.toLowerCase()) ||
      f.vendor.toLowerCase().includes(vendorKey)
  );

  if (!hit) return result;

  const personal = [
    "ID_Card",
    "Passport",
    "Driver_License",
    "Car_License",
    "Insurance",
    "Certificate",
    "ID",
  ].includes(hit.doc_type);

  return {
    ...result,
    doc_type: hit.doc_type as DocType,
    vendor: hit.vendor,
    suggested_folder_name: personal ? PERSONAL_VAULT_FOLDER_HE : hit.folder,
    is_personal_doc: personal,
    is_unpaid_bill: personal ? false : result.is_unpaid_bill,
    summary: hit.summary || result.summary,
    confidence: Math.max(result.confidence, 0.95),
  };
}
