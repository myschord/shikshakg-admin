"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "react-toastify";
import MediaPanel from "@/components/questions/MediaPanel";
import QuestionEditor from "@/components/questions/QuestionEditor";
import { QuestionFacts, QuestionPreview, StatusBadge } from "@/components/questions/parts";
import Button from "@/components/kit/Button";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import { useExamNames } from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { isApiError } from "@/lib/api/errors";
import type { QuestionStatus } from "@/lib/api/questions";
import { checkedLabel } from "@/lib/date";
import { useQuestion, useQuestionMutations } from "@/lib/hooks/useQuestions";

type Move = { to: QuestionStatus; label: string; needsNote: boolean; tone: "primary" | "secondary" | "danger" };
// The moves the backend allows from each status. The backend's table (questions/admin.py TRANSITIONS) is keyed by
// the target status, so read it as: published may come from draft, in review or retired; retired only from published.
const MOVES: Record<QuestionStatus, Move[]> = {
  draft: [
    { to: "in_review", label: "Send to review", needsNote: false, tone: "primary" },
    { to: "published", label: "Publish now", needsNote: false, tone: "secondary" },
    { to: "rejected", label: "Reject", needsNote: true, tone: "danger" },
  ],
  in_review: [
    { to: "published", label: "Publish", needsNote: false, tone: "primary" },
    { to: "draft", label: "Send back to draft", needsNote: true, tone: "secondary" },
    { to: "rejected", label: "Reject", needsNote: true, tone: "danger" },
  ],
  published: [
    { to: "in_review", label: "Pull back to review", needsNote: true, tone: "secondary" },
    { to: "retired", label: "Retire", needsNote: true, tone: "danger" },
  ],
  rejected: [
    { to: "draft", label: "Reopen as draft", needsNote: false, tone: "secondary" },
    { to: "in_review", label: "Send to review", needsNote: false, tone: "primary" },
  ],
  retired: [
    { to: "published", label: "Publish again", needsNote: false, tone: "primary" },
    { to: "in_review", label: "Send to review", needsNote: false, tone: "secondary" },
  ],
};

export default function QuestionView() {
  const params = useSearchParams();
  const id = params.get("id");
  const q = useQuestion(id);
  const names = useExamNames();
  const { setStatus } = useQuestionMutations();
  const [editing, setEditing] = useState(params.get("edit") === "1");
  const [move, setMove] = useState<Move | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  if (!id) return <p className="text-sm">No question selected. <Link href="/questions" className="font-semibold text-primary underline">Back to the question bank</Link></p>;
  if (q.isPending) return <Skeleton className="mx-auto h-96 max-w-5xl" />;
  if (q.isError) return <div className="mx-auto max-w-5xl"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  const question = q.data;

  async function run() {
    if (!move) return;
    if (move.needsNote && !note.trim()) {
      setNoteError("Write a short note. It goes in the audit log.");
      return;
    }
    try {
      await setStatus.mutateAsync({ id: question.id, status: move.to, note: note.trim() || null });
      toast.success(`${move.label}: done.`);
      setMove(null);
      setNote("");
      setNoteError(null);
    } catch {
      // shown in the dialog
    }
  }
  const notPublishable = isApiError(setStatus.error) && setStatus.error.code === "not_publishable";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/questions" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Question bank
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">Question</h1>
          <StatusBadge status={question.status} />
          <span className="text-xs text-ink-muted">Version {question.version} · updated {checkedLabel(question.updated_at)}</span>
        </div>
      </div>

      {question.review_note && (
        <p className="rounded-lg bg-bg-tint px-3 py-2 text-sm">
          <span className="font-semibold">Last review note:</span> {question.review_note}
        </p>
      )}
      {question.open_reports > 0 && (
        <p className="rounded-lg border border-error/25 bg-error/5 px-3 py-2 text-sm font-semibold text-error-text">
          {question.open_reports} open student report{question.open_reports === 1 ? "" : "s"}. <Link href="/reports" className="underline">Open the reports queue</Link>
        </p>
      )}

      {editing ? (
        <QuestionEditor
          mode="edit"
          question={question}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.success("Saved.");
          }}
        />
      ) : (
        <>
          <QuestionFacts q={question} examName={names.get(question.exam_slug) ?? question.exam_slug} />
          <QuestionPreview q={question} />
          <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-white p-3">
            <Button variant="secondary" onClick={() => setEditing(true)} icon={<Pencil className="h-4 w-4" aria-hidden />}>
              Edit
            </Button>
            {MOVES[question.status as QuestionStatus].map((m) => (
              <Button
                key={m.to}
                variant={m.tone}
                onClick={() => {
                  setStatus.reset();
                  setNote("");
                  setNoteError(null);
                  setMove(m);
                }}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <MediaPanel questionId={question.id} />
          <p className="text-xs text-ink-muted">
            Created {checkedLabel(question.created_at)}
            {question.reviewed_at ? ` · last reviewed ${checkedLabel(question.reviewed_at)}` : ""}
            {question.published_at ? ` · published ${checkedLabel(question.published_at)}` : ""}. Every status change is written to the audit log with your name.
          </p>
        </>
      )}

      <Dialog open={!!move} title={move?.label ?? ""} onClose={() => setMove(null)} busy={setStatus.isPending}>
        <p className="mb-3 text-sm text-ink-muted">
          {move?.to === "published" ? "Students will be able to practise this question straight away." : move?.to === "retired" ? "The question disappears for students. Attempts that already include it keep their results." : move?.to === "draft" || move?.to === "in_review" ? "Students can no longer see this question until it is published again." : "The question stays out of student view."}
        </p>
        {move && (move.needsNote || move.to === "published") && (
          <Field label={move.needsNote ? "Note" : "Note (optional)"} required={move.needsNote} error={noteError}>
            {(p) => <textarea {...p} rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={`${inputClass} py-2`} />}
          </Field>
        )}
        {setStatus.error ? (
          <div className="mt-3">
            <ErrorState compact error={setStatus.error} />
            {notPublishable && (
              <button type="button" onClick={() => { setMove(null); setEditing(true); }} className="mt-1 inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
                Edit the question to add its topic
              </button>
            )}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setMove(null)} disabled={setStatus.isPending}>
            Cancel
          </Button>
          <Button variant={move?.tone === "danger" ? "danger" : "primary"} onClick={run} loading={setStatus.isPending}>
            {move?.label}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
