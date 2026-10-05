"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { QuestionPreview, StatusBadge } from "@/components/questions/parts";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import { useExamNames } from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { questionsApi, REASON_LABEL, type Report, type ReportStatus } from "@/lib/api/questions";
import { checkedLabel } from "@/lib/date";
import { useQuestion, useReports } from "@/lib/hooks/useQuestions";

const TABS: { id: ReportStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Dismissed" },
];

/** Student reports grouped by question. Fixing a question means resolving its reports and sending it back to review. */
export default function ReportsScreen() {
  const [tab, setTab] = useState<ReportStatus>("open");
  const q = useReports(tab);
  const reports = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const groups = useMemo(() => {
    const m = new Map<string, Report[]>();
    for (const r of reports) m.set(r.question_id, [...(m.get(r.question_id) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [reports]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Student reports</h1>
        <p className="mt-1 text-sm text-ink-muted">Questions students flagged, most reported first. Check the question, then fix it or close the reports with a note.</p>
      </div>
      <div role="group" aria-label="Report status" className="flex gap-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${tab === t.id ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-muted hover:border-primary"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <Skeleton className="h-48" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center">
          <p className="font-semibold">{tab === "open" ? "No open reports" : `No ${tab} reports`}</p>
          {tab === "open" && <p className="mt-1 text-sm text-ink-muted">Nothing students have flagged needs a look.</p>}
        </div>
      ) : (
        <>
          <ul className="space-y-4">
            {groups.map(([questionId, rs]) => (
              <ReportGroup key={questionId} questionId={questionId} reports={rs} actionable={tab === "open"} />
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReportGroup({ questionId, reports, actionable }: { questionId: string; reports: Report[]; actionable: boolean }) {
  const qc = useQueryClient();
  const names = useExamNames();
  const question = useQuestion(questionId);
  const [dialog, setDialog] = useState<"fix" | "dismiss" | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);

  const reasons = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of reports) c.set(r.reason, (c.get(r.reason) ?? 0) + 1);
    return [...c.entries()];
  }, [reports]);

  async function run() {
    if (dialog === "fix" && !note.trim()) {
      setNoteError("Say what you found or changed. Students never see this, staff do.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Reports are closed one by one; a question that is live goes back to review so it is checked again before students see it.
      for (const r of reports) await questionsApi.resolveReport(r.id, dialog === "fix" ? "resolved" : "dismissed", note.trim() || null);
      if (dialog === "fix" && question.data?.status === "published") await questionsApi.setStatus(questionId, "in_review", `Sent back after student reports: ${note.trim()}`);
      await Promise.all([qc.invalidateQueries({ queryKey: ["reports"] }), qc.invalidateQueries({ queryKey: ["questions"] })]);
      toast.success(dialog === "fix" ? "Reports resolved. The question is back in the review queue." : "Reports dismissed.");
      setDialog(null);
      setNote("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const q = question.data;
  return (
    <li className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="danger">
              {reports.length} report{reports.length === 1 ? "" : "s"}
            </Badge>
            {q && <StatusBadge status={q.status} />}
            {q && <span className="text-xs text-ink-muted">{names.get(q.exam_slug) ?? q.exam_slug} · {q.subject.name}</span>}
          </div>
          <p className="mt-2 text-sm">
            {reasons.map(([r, n]) => (
              <span key={r} className="mr-3 inline-block font-semibold">
                {REASON_LABEL[r] ?? r}
                {n > 1 ? ` ×${n}` : ""}
              </span>
            ))}
          </p>
        </div>
        <Link href={`/questions/view?id=${questionId}`} className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
          Open the question
        </Link>
      </div>

      <ul className="mt-3 space-y-1.5 text-sm">
        {reports.map((r) => (
          <li key={r.id} className="rounded-lg bg-bg-tint px-3 py-2">
            <span className="font-semibold">{REASON_LABEL[r.reason] ?? r.reason}</span>
            <span className="text-xs text-ink-muted"> · {checkedLabel(r.created_at)}</span>
            {r.details && <span className="block">{r.details}</span>}
            {r.resolution_note && <span className="block text-xs italic text-ink-muted">Staff note: {r.resolution_note}</span>}
          </li>
        ))}
      </ul>

      {question.isPending ? (
        <Skeleton className="mt-3 h-24" />
      ) : question.isError ? (
        <div className="mt-3">
          <ErrorState compact error={question.error} />
        </div>
      ) : q ? (
        <div className="mt-3">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="min-h-[44px] text-sm font-semibold text-primary hover:underline">
            {open ? "Hide the question" : "Show the question"}
          </button>
          {open && <QuestionPreview q={q} />}
        </div>
      ) : null}

      {actionable && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-line pt-3">
          <Button onClick={() => setDialog("fix")}>Resolve and send back to review</Button>
          <Button variant="secondary" onClick={() => setDialog("dismiss")}>
            Dismiss: the question is fine
          </Button>
        </div>
      )}

      <Dialog open={!!dialog} title={dialog === "fix" ? "Resolve these reports" : "Dismiss these reports"} onClose={() => setDialog(null)} busy={busy}>
        <p className="mb-3 text-sm text-ink-muted">
          {dialog === "fix"
            ? `Closes ${reports.length} report${reports.length === 1 ? "" : "s"} as resolved. ${q?.status === "published" ? "The question is pulled back to the review queue so it is checked again before students see it." : "The question is not live, so its status stays as it is."}`
            : `Closes ${reports.length} report${reports.length === 1 ? "" : "s"} without changing the question.`}
        </p>
        <Field label={dialog === "fix" ? "What did you find or change?" : "Note (optional)"} required={dialog === "fix"} error={noteError}>
          {(p) => <textarea {...p} rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={`${inputClass} py-2`} />}
        </Field>
        {error ? (
          <div className="mt-3">
            <ErrorState compact error={error} />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} loading={busy}>
            {dialog === "fix" ? "Resolve" : "Dismiss"}
          </Button>
        </div>
      </Dialog>
    </li>
  );
}
