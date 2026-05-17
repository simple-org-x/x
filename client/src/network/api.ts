/**
 * Minimal REST wrapper. Phase 1 does not actually call any endpoints, but
 * exposing this seam keeps the coupling between game UI and transport
 * trivial to wire up later.
 */

const BASE_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.VITE_API_URL) ||
  'http://localhost:8080';

export interface ApiOptions extends RequestInit {
  /** Disable the standard JSON content-type header. */
  raw?: boolean;
}

async function request<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { raw, headers, ...rest } = opts;
  const finalHeaders: HeadersInit = raw
    ? headers ?? {}
    : { 'Content-Type': 'application/json', ...(headers ?? {}) };

  const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers: finalHeaders });
  if (!res.ok) {
    throw new Error(`API ${rest.method ?? 'GET'} ${path} -> ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string, opts?: ApiOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T,>(path: string, body?: unknown, opts?: ApiOptions) =>
    request<T>(path, { ...opts, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  baseUrl: BASE_URL,
};
