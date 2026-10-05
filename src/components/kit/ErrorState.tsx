"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, RefreshCw } from "lucide-react";
import { isApiError, retryHint } from "@/lib/api/errors";

/** A failure, with the backend's message, any wait time, and the request id so the log line can be found. */
export default function ErrorState({ error, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const message = error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
  const hint = retryHint(error);
  const id = isApiError(error) ? error.requestId : null;
  const lines = isApiError(error) && Array.isArray(error.details)
    ? (error.details as { loc?: unknown[]; message?: string }[]).slice(0, 5).map((d) => `${Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body" && x !== "query").join(" ") : ""}${d.message ? `: ${d.message}` : ""}`.trim()).filter(Boolean)
    : [];

  return (
    <div role="alert" className={`flex flex-col items-start gap-2 rounded-xl border border-error/25 bg-error/5 ${compact ? "p-3" : "p-5"}`}>
      <p className="flex items-start gap-2 text-sm font-semibold text-ink">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-error-text" aria-hidden /> {message}
      </p>
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      {lines.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-ink-muted">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {onRetry && (
          <button type="button" onClick={onRetry} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
        )}
        {id && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(id);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {}
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-xs text-ink-muted hover:text-ink"
            aria-label={`Copy request id ${id}`}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success-text" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} Request {id.slice(0, 13)}
          </button>
        )}
      </div>
    </div>
  );
}
