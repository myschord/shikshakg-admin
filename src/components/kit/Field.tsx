"use client";

import { useId } from "react";

export const inputClass =
  "block min-h-[44px] w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-muted/70 disabled:bg-bg-tint disabled:text-ink-muted aria-[invalid=true]:border-error";

/**
 * A labelled form control with help text and an error, wired together for screen readers.
 * Pass a render function so the control gets the generated id and aria attributes.
 */
export default function Field({
  label,
  help,
  error,
  required = false,
  children,
  className = "",
}: {
  label: string;
  help?: string;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; required?: boolean }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="text-error-text" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
      {help && !error && (
        <p id={`${id}-help`} className="mt-1 text-xs text-ink-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-error-text">
          {error}
        </p>
      )}
    </div>
  );
}
