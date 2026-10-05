"use client";

import { toast } from "react-toastify";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import { formatDay } from "@/lib/date";
import type { AdminEvent } from "@/lib/api/examEvents";
import { useEventMutations } from "@/lib/hooks/useExamEvents";

export type EventAction = { type: "publish" | "retire" | "recheck"; event: AdminEvent } | null;

const COPY = {
  publish: { title: "Publish this date?", confirm: "Publish", done: "Published. Students can see it now." },
  retire: { title: "Retire this date?", confirm: "Retire", done: "Retired. Students no longer see it." },
  recheck: { title: "Record that you checked the source?", confirm: "Yes, I checked it", done: "Recorded. The checked-on date is now today." },
} as const;

/** Confirms the three actions that change what students see or what we claim about a date. */
export default function ActionDialog({ action, examName, onClose }: { action: EventAction; examName: string; onClose: () => void }) {
  const m = useEventMutations(action?.event.exam_slug ?? null);
  const current = action ? m[action.type] : null;
  const e = action?.event;

  async function run() {
    if (!action || !current) return;
    try {
      await current.mutateAsync(action.event.id);
      toast.success(COPY[action.type].done);
      onClose();
    } catch {
      // the error shows inside the dialog
    }
  }

  return (
    <ConfirmDialog
      open={!!action}
      title={action ? COPY[action.type].title : ""}
      confirmLabel={action ? COPY[action.type].confirm : ""}
      danger={action?.type === "retire"}
      busy={current?.isPending}
      error={current?.error}
      onConfirm={run}
      onCancel={() => {
        current?.reset();
        onClose();
      }}
    >
      {e && (
        <p className="rounded-lg bg-bg-tint px-3 py-2 text-ink">
          <strong>{examName}</strong>: {e.title}, {formatDay(e.starts_on)}
          {e.ends_on ? ` to ${formatDay(e.ends_on)}` : ""} ({e.certainty})
        </p>
      )}
      {action?.type === "publish" && (
        <>
          <p>Students following this exam will see this date on their Dates page and Home. If it replaces an earlier date, the earlier one is retired in the same step.</p>
          <p>Students who turned on exam date alerts are notified within about a minute, and their study plans are rebuilt if the exam date moved. Check the source link and the date once more before you confirm.</p>
        </>
      )}
      {action?.type === "retire" && <p>The date disappears from the student website. Use this for a date that was entered by mistake or no longer applies. To correct a date, use Correct instead.</p>}
      {action?.type === "recheck" && <p>Confirm that you opened the official source today and the date is still right. Students see this checked-on date next to the date.</p>}
    </ConfirmDialog>
  );
}
