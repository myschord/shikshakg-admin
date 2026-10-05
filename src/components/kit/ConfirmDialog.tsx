"use client";

import Button from "@/components/kit/Button";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";

/** Asks before something students can see changes. Says what will happen, and shows the server's refusal if there is one. */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} title={title} onClose={onCancel} busy={busy} role="alertdialog">
      <div className="space-y-3 text-sm text-ink-muted">{children}</div>
      {error ? (
        <div className="mt-4">
          <ErrorState compact error={error} />
        </div>
      ) : null}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
