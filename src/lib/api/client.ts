import { API_PREFIX, config } from "@/lib/config";
import { ApiError, NetworkError, toApiError } from "./errors";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./tokens";

export { ApiError, NetworkError, isApiError, errorMessage, retryHint } from "./errors";
export { getAccessToken as getToken, setTokens, clearTokens } from "./tokens";

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export type RequestOptions = {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Sent as the Idempotency-Key header. Create once per user action, reuse on retry. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** "none" never sends the token; "optional" (default) sends it when present. */
  auth?: "none" | "optional";
  /** Lets the request finish while the page is closing (progress heartbeats). */
  keepalive?: boolean;
  /** "no-cache" makes the browser check with the server even when the response says it may be reused. */
  cache?: RequestCache;
};

/** Fresh key for one user action (an order, an AI practice request). */
export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// ── session expiry ────────────────────────────────────────────────────────────

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

type RefreshResult = "ok" | "rejected" | "offline";
let inFlightRefresh: Promise<RefreshResult> | null = null;

/**
 * Exchanges the refresh token for a new pair. One refresh runs at a time, in this tab
 * (shared promise) and across tabs (Web Locks), because the backend rotates the refresh
 * token and treats reuse of an old one as theft.
 */
function refreshSession(failedAccessToken: string | null): Promise<RefreshResult> {
  if (inFlightRefresh) return inFlightRefresh;

  const run = async (): Promise<RefreshResult> => {
    // Another tab already refreshed while this request was failing.
    const current = getAccessToken();
    if (current && current !== failedAccessToken) return "ok";

    const refreshToken = getRefreshToken();
    if (!refreshToken) return "rejected";
    let res: Response;
    try {
      res = await fetch(`${config.apiUrl}${API_PREFIX}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      return "offline";
    }
    if (res.ok) {
      const data = (await res.json()) as { access_token: string; refresh_token: string };
      setTokens(data); // both tokens: the refresh token rotates every time
      return "ok";
    }
    // The server is struggling or throttling us: the session may still be valid.
    if (res.status >= 500 || res.status === 429) return "offline";
    return "rejected";
  };

  const locked =
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("sga-token-refresh", run)
      : run();

  inFlightRefresh = locked.finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

// ── core request ──────────────────────────────────────────────────────────────

function buildUrl(path: string, query?: Query) {
  const base = path.startsWith("http") ? path : `${config.apiUrl}${path.startsWith(API_PREFIX) ? path : API_PREFIX + path}`;
  if (!query) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)));
    else qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

async function send(method: string, path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && opts.body instanceof Blob;
  const isRaw = isForm || isBlob;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.body !== undefined && !isRaw ? { "Content-Type": "application/json" } : {}),
    ...(isBlob ? { "Content-Type": (opts.body as Blob).type || "application/octet-stream" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    ...opts.headers,
  };
  try {
    return await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : isRaw ? (opts.body as FormData | Blob) : JSON.stringify(opts.body),
      signal: opts.signal,
      keepalive: opts.keepalive,
      cache: opts.cache,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new NetworkError();
  }
}

async function rawRequest(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
  const token = opts.auth === "none" ? null : getAccessToken();
  let res = await send(method, path, opts, token);

  // A 401 on a call that carried no token (login, public pages) is not an expired session.
  if (res.status === 401 && token) {
    const outcome = await refreshSession(token);
    if (outcome === "ok") {
      res = await send(method, path, opts, getAccessToken());
      if (res.status !== 401) return res;
    } else if (outcome === "offline") {
      throw new NetworkError();
    }
    clearTokens();
    onUnauthorized?.();
    throw new ApiError({
      status: 401,
      code: "session_expired",
      message: "Your session has expired. Please sign in again.",
    });
  }
  return res;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(method, path, opts);
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post: <T,>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, { ...opts, body: body ?? {} }),
  put: <T,>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, { ...opts, body: body ?? {} }),
  patch: <T,>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, { ...opts, body: body ?? {} }),
  delete: <T = void,>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
  /** Binary download (resource files). */
  async blob(path: string, opts?: RequestOptions) {
    const res = await rawRequest("GET", path, opts);
    if (!res.ok) throw await toApiError(res);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    return { blob: await res.blob(), filename: match ? decodeURIComponent(match[1]) : "download" };
  },
};

/** Cursor page returned by list routes. */
export type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean };

// ── legacy surface ────────────────────────────────────────────────────────────
// Screens that still use the old `{ data }` shape keep working until their phase
// rewires them. Do not use in new code; use `api` above.
const wrap = async <T,>(p: Promise<T>) => ({ data: (await p) as any });
export const apiClient = {
  get: (path: string, opts?: RequestOptions) => wrap(api.get(path, opts)),
  post: (path: string, body?: unknown) => wrap(api.post(path, body)),
  patch: (path: string, body?: unknown) => wrap(api.patch(path, body)),
  put: (path: string, body?: unknown) => wrap(api.put(path, body)),
  delete: (path: string) => wrap(api.delete(path)),
  postForm: (path: string, form: FormData) => wrap(api.post(path, form)),
  getBlob: (path: string) => api.blob(path),
};
export const BASE_URL = config.apiUrl;
