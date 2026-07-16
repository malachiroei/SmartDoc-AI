import { he } from "@/lib/i18n/he";

type FetchJsonOptions = RequestInit & {
  /** Fallback Hebrew message when the network request itself fails */
  networkError?: string;
};

/**
 * Client-side JSON fetch using clean relative API paths only.
 * Never hardcodes localhost — paths like `/api/rules/upsert`.
 */
export async function fetchJson<T = Record<string, unknown>>(
  path: string,
  options: FetchJsonOptions = {}
): Promise<{ data: T; response: Response }> {
  const { networkError, ...init } = options;

  if (!path.startsWith("/")) {
    throw new Error(he.errors.invalidApiPath);
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    const msg =
      err instanceof Error && err.message.toLowerCase().includes("fetch failed")
        ? networkError ?? he.errors.network
        : err instanceof Error
          ? err.message
          : he.errors.network;
    throw new Error(msg);
  }

  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    throw new Error(
      response.ok
        ? he.errors.badResponse
        : `${he.errors.serverError} (${response.status})`
    );
  }

  return { data, response };
}

export async function fetchJsonOk<T = Record<string, unknown>>(
  path: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const { data, response } = await fetchJson<T>(path, options);
  const record = data as Record<string, unknown>;

  if (!response.ok) {
    const apiError =
      typeof record.error === "string"
        ? record.error
        : he.errors.serverError;
    throw new Error(apiError);
  }

  return data;
}
