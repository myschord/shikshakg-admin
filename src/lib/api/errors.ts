// Backend error envelope: { error: { code, message, details, request_id } }
// FastAPI's own validation errors (`detail: [...]`) are also understood.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;
  /** Seconds to wait, from the Retry-After header on a 429. */
  readonly retryAfter: number | null;
  /** True only when the server definitively rejected the session. */
  readonly isAuthError: boolean;

  constructor(init: {
    status: number;
    code?: string;
    message: string;
    details?: unknown;
    requestId?: string | null;
    retryAfter?: number | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code ?? "error";
    this.details = init.details ?? null;
    this.requestId = init.requestId ?? null;
    this.retryAfter = init.retryAfter ?? null;
    this.isAuthError = init.status === 401;
  }

  get isRateLimited() {
    return this.status === 429;
  }
  get isEntitlementRequired() {
    return this.status === 403 && this.code === "entitlement_required";
  }
}

/** Thrown when the server could not be reached at all (offline, DNS, CORS). */
export class NetworkError extends Error {
  constructor(message = "Network error. Check your connection and try again.") {
    super(message);
    this.name = "NetworkError";
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.ceil(n)) : null;
}

type Envelope = {
  error?: { code?: string; message?: string; details?: unknown; request_id?: string };
  detail?: unknown;
};

export async function toApiError(res: Response): Promise<ApiError> {
  const requestId = res.headers.get("X-Request-ID");
  const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
  let body: Envelope = {};
  try {
    body = (await res.json()) as Envelope;
  } catch {
    // non-JSON error body (proxy page, empty 502): fall through to the generic text
  }

  if (body.error) {
    return new ApiError({
      status: res.status,
      code: body.error.code,
      message: body.error.message || fallbackMessage(res.status),
      details: body.error.details,
      requestId: body.error.request_id ?? requestId,
      retryAfter,
    });
  }

  if (typeof body.detail === "string") {
    return new ApiError({ status: res.status, message: body.detail, requestId, retryAfter });
  }
  if (Array.isArray(body.detail)) {
    const msg = body.detail
      .map((e) => (e && typeof e === "object" && "msg" in e ? String((e as { msg: unknown }).msg) : ""))
      .filter(Boolean)
      .join(", ");
    return new ApiError({
      status: res.status,
      code: "validation_error",
      message: msg || fallbackMessage(res.status),
      details: body.detail,
      requestId,
      retryAfter,
    });
  }
  return new ApiError({ status: res.status, message: fallbackMessage(res.status), requestId, retryAfter });
}

function fallbackMessage(status: number) {
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  if (status === 403) return "You do not have access to this.";
  if (status === 404) return "We could not find that.";
  return "Request failed.";
}

/** Plain text for toasts and inline errors; never throws. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}

/** Rate-limit aware text: "Try again in 30 seconds." */
export function retryHint(err: unknown): string | null {
  if (isApiError(err) && err.retryAfter != null && err.retryAfter > 0) {
    return err.retryAfter >= 90
      ? `Try again in ${Math.ceil(err.retryAfter / 60)} minutes.`
      : `Try again in ${err.retryAfter} seconds.`;
  }
  return null;
}
