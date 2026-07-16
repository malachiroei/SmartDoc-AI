import { fetchJsonOk } from "@/lib/api/client-fetch";
import type {
  ClassificationResult,
  PersonalDocument,
  RetrieveResult,
} from "@/lib/types";
import { he } from "@/lib/i18n/he";

export async function fetchVaultDocuments(): Promise<PersonalDocument[]> {
  const data = await fetchJsonOk<{ documents: PersonalDocument[] }>(
    "/api/vault",
    { networkError: he.vault.loadError }
  );
  return data.documents;
}

export async function createVaultFromClassification(
  classification: ClassificationResult,
  driveFile: { id: string; webViewLink?: string }
): Promise<PersonalDocument | null> {
  if (!classification.is_personal_doc) return null;

  const data = await fetchJsonOk<{
    document?: PersonalDocument;
    skipped?: boolean;
  }>("/api/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      classification,
      driveFileId: driveFile.id,
      driveFileUrl: driveFile.webViewLink ?? null,
    }),
    networkError: he.vault.createError,
  });

  return data.document ?? null;
}

export async function retrieveFromAgent(query: string): Promise<RetrieveResult> {
  return fetchJsonOk<RetrieveResult>("/api/agent/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    networkError: he.vault.retrieveError,
  });
}
