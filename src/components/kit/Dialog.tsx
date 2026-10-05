"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

/**
 * A modal dialog. Focus moves in and stays in, Escape closes it (unless `busy`), and focus goes back to the
 * button that opened it.
 */
export default function Dialog({
  open,
  title,
  onClose,
  busy = false,
  wide = false,
  role = "dialog",
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  role?: "dialog" | "alertdialog";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={ref} role={role} aria-modal="true" aria-labelledby={titleId} className={`w-full rounded-2xl bg-white p-6 shadow-xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-border-tint disabled:opacity-50">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
