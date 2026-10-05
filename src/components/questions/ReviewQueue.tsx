"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CornerUpLeft, Flag, Keyboard, Pencil, SkipForward, Undo2, X } from "lucide-react";
import { QuestionFacts, QuestionPreview } from "@/components/questions/parts";
import Button from "@/components/kit/Button";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect, { useExamNames } from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { isApiError } from "@/lib/api/errors";
import { questionsApi, type QuestionListItem, type QuestionStatus } from "@/lib/api/questions";
import { useQuestion, useQuestionList, useQuestionMedia, useQuestionMutations } from "@/lib/hooks/useQuestions";

type Mode = "view" | "send_back" | "reject";
type Last = { id: string; label: string } | null;

const KEYS: [string, string][] = [
  ["A", "Approve and publish"],
  ["R", "Send back to draft with a note"],
  ["X", "Reject with a note"],
  ["S or →", "Skip to the next question"],
  ["U", "Undo the last decision"],
  ["E", "Open the editor"],
  ["?", "Show or hide this list"],
  ["Enter / Esc", "Save or cancel a note"],
];

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/**
 * One question at a time, decided with the keyboard. Every decision is announced, the last one can be undone,
 * and questions that cannot be published say why instead of failing silently.
 */
export default function ReviewQueue() {
  const router = useRouter();
  const qc = useQueryClient();
  const names = useExamNames();
  const [exam, setExam] = useState("");
  const list = useQuestionList({ exam: exam || undefined, status: "in_review" });
  const { setStatus } = useQuestionMutations();

  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [last, setLast] = useState<Last>(null);
  const [announce, setAnnounce] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [help, setHelp] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const queue = useMemo(() => {
    const live = items.filter((i) => !handled.has(i.id));
    const first = live.filter((i) => !skipped.includes(i.id));
    const later = skipped.map((id) => live.find((i) => i.id === id)).filter((i): i is QuestionListItem => !!i);
    return [...first, ...later];
  }, [items, handled, skipped]);
  const current = queue[0] ?? null;
  const detail = useQuestion(current?.id ?? null);
  const full = detail.data ?? null;
  const media = useQuestionMedia(current?.id ?? null);
  // Have the next question ready so approving never waits on the network.
  const nextId = queue[1]?.id;
  useEffect(() => {
    if (nextId) void qc.prefetchQuery({ queryKey: ["questions", "one", nextId], queryFn: () => questionsApi.get(nextId), staleTime: 30_000 });
  }, [nextId, qc]);
  const more = !!list.hasNextPage;

  // Keep the queue topped up so it never runs dry in the middle of a session.
  useEffect(() => {
    if (queue.length < 5 && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [queue.length, list]);

  // Say which question is now on screen, for screen readers.
  useEffect(() => {
    if (current) setAnnounce((a) => (a ? `${a} Next: ${current.preview.slice(0, 80) || "question"}.` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const left = queue.length;
  const leftText = `${left}${more ? "+" : ""} left`;

  const decide = useCallback(
    async (status: QuestionStatus, label: string, noteText?: string) => {
      if (!current || setStatus.isPending) return;
      setError(null);
      try {
        await setStatus.mutateAsync({ id: current.id, status, note: noteText });
        setHandled((h) => new Set(h).add(current.id));
        setLast({ id: current.id, label });
        setMode("view");
        setNote("");
        setAnnounce(`${label}. ${Math.max(0, left - 1)}${more ? "+" : ""} left in the queue.`);
      } catch (err) {
        setError(err);
        setAnnounce(isApiError(err) ? err.message : "That did not work.");
      }
    },
    [current, setStatus, left, more]
  );

  const undo = useCallback(async () => {
    if (!last || setStatus.isPending) return;
    try {
      await setStatus.mutateAsync({ id: last.id, status: "in_review", note: "Undone from the review queue" });
      setHandled((h) => {
        const n = new Set(h);
        n.delete(last.id);
        return n;
      });
      setAnnounce(`Undone: ${last.label}. The question is back in the queue.`);
      setLast(null);
    } catch (err) {
      setError(err);
    }
  }, [last, setStatus]);

  const skip = useCallback(() => {
    if (!current || queue.length < 2) return;
    setSkipped((s) => [...s.filter((x) => x !== current.id), current.id]);
    setAnnounce("Skipped.");
  }, [current, queue.length]);

  const submitNote = () => {
    if (!note.trim()) {
      setNoteError("Write a short note so the author knows what to fix.");
      noteRef.current?.focus();
      return;
    }
    setNoteError(null);
    void decide(mode === "reject" ? "rejected" : "draft", mode === "reject" ? "Rejected" : "Sent back", note.trim());
  };

  // The shortcuts. They are ignored while typing, and with Ctrl, Alt or Command held so browser shortcuts still work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "?") return setHelp((h) => !h);
      // Undo works even when the queue has just been cleared, which is exactly when a slip is noticed.
      if (k === "u") return void undo();
      if (!current) return;
      if (k === "a") void decide("published", "Approved");
      else if (k === "r") {
        setMode("send_back");
        e.preventDefault();
      } else if (k === "x") {
        setMode("reject");
        e.preventDefault();
      } else if (k === "s" || e.key === "ArrowRight") skip();
      else if (k === "e") router.push(`/questions/view?id=${current.id}&edit=1`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, decide, skip, undo, router]);

  useEffect(() => {
    if (mode !== "view") noteRef.current?.focus();
  }, [mode]);

  const notPublishable = isApiError(error) && error.code === "not_publishable";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/questions" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Question bank
          </Link>
          <h1 className="text-2xl font-extrabold">Review queue</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Exam" className="w-56">
            {(p) => (
              <ExamSelect
                {...p}
                value={exam}
                onChange={(v) => {
                  setExam(v);
                  setSkipped([]);
                }}
                allLabel="All exams"
              />
            )}
          </Field>
          <Button variant="secondary" onClick={() => setHelp((h) => !h)} aria-expanded={help} icon={<Keyboard className="h-4 w-4" aria-hidden />}>
            Shortcuts
          </Button>
        </div>
      </div>

      {help && (
        <section aria-label="Keyboard shortcuts" className="rounded-xl border border-line bg-white p-4">
          <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {KEYS.map(([k, d]) => (
              <div key={k} className="flex items-center gap-3 text-sm">
                <dt>
                  <kbd className="rounded border border-line bg-bg-tint px-2 py-0.5 font-mono text-xs font-bold">{k}</kbd>
                </dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {list.isPending ? (
        <Skeleton className="h-96" />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !current ? (
        <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success-text">
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mt-3 text-lg font-bold">The review queue is clear</h2>
          <p className="mt-1 text-sm text-ink-muted">{exam ? `Nothing waiting for ${names.get(exam) ?? "this exam"}.` : "No question is waiting for review."}</p>
          {last && (
            <Button variant="secondary" className="mt-4" onClick={undo} icon={<Undo2 className="h-4 w-4" aria-hidden />}>
              Undo: {last.label}
            </Button>
          )}
        </div>
      ) : (
        <article aria-label="Question under review" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink-muted">
              <span className="tabular-nums text-ink">{leftText}</span>
              {skipped.length > 0 && <span> · {skipped.filter((id) => queue.some((q) => q.id === id)).length} skipped, shown last</span>}
            </p>
            {last && (
              <button type="button" onClick={undo} className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                <Undo2 className="h-4 w-4" aria-hidden /> Undo: {last.label} <kbd className="rounded border border-line bg-bg-tint px-1.5 font-mono text-xs">U</kbd>
              </button>
            )}
          </div>

          {detail.isPending && <Skeleton className="h-72" />}
          {detail.isError && <ErrorState error={detail.error} onRetry={() => detail.refetch()} />}
          {full && full.open_reports > 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-error/25 bg-error/5 px-3 py-2 text-sm font-semibold text-error-text">
              <Flag className="h-4 w-4" aria-hidden /> {full?.open_reports} open student report{full?.open_reports === 1 ? "" : "s"} on this question.
              <Link href="/reports" className="ml-auto underline">
                See reports
              </Link>
            </p>
          )}
          {full?.review_note && (
            <p className="rounded-lg bg-bg-tint px-3 py-2 text-sm">
              <span className="font-semibold">Last note:</span> {full.review_note}
            </p>
          )}

          {full && <QuestionFacts q={full} examName={names.get(full.exam_slug) ?? full.exam_slug} />}
          {full && <QuestionPreview q={full} />}

          {media.data && media.data.length > 0 && (
            <ul aria-label="Images" className="flex flex-wrap gap-3">
              {media.data.map((m) => (
                <li key={m.id} className="rounded-lg border border-line bg-white p-2 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.alt_text ?? `Image for ${m.placement}`} className="max-h-32 rounded" />
                  <p className="mt-1 font-semibold">{m.placement}</p>
                </li>
              ))}
            </ul>
          )}

          {error ? (
            <div>
              <ErrorState compact error={error} />
              {notPublishable && (
                <Link href={`/questions/view?id=${current.id}&edit=1`} className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
                  Open the editor to add the topic
                </Link>
              )}
            </div>
          ) : null}

          {mode !== "view" ? (
            <form
              noValidate
              className="space-y-2 rounded-xl border border-line bg-white p-4"
              onSubmit={(e) => {
                e.preventDefault();
                submitNote();
              }}
            >
              <Field label={mode === "reject" ? "Why is it rejected?" : "What needs to change?"} error={noteError} required>
                {(p) => (
                  <input
                    {...p}
                    ref={noteRef}
                    value={note}
                    maxLength={500}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setMode("view");
                        setNote("");
                        setNoteError(null);
                      }
                    }}
                    className={inputClass}
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" variant={mode === "reject" ? "danger" : "primary"} loading={setStatus.isPending}>
                  {mode === "reject" ? "Reject" : "Send back"} <span className="text-xs opacity-80">(Enter)</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setMode("view");
                    setNote("");
                    setNoteError(null);
                  }}
                >
                  Cancel <span className="text-xs opacity-70">(Esc)</span>
                </Button>
              </div>
            </form>
          ) : (
            <div role="group" aria-label="Decide" className="sticky bottom-3 flex flex-wrap gap-3 rounded-xl border border-line bg-white p-3 shadow-md">
              <Button onClick={() => decide("published", "Approved")} loading={setStatus.isPending} icon={<Check className="h-4 w-4" aria-hidden />}>
                Approve <kbd className="rounded bg-white/20 px-1.5 font-mono text-xs">A</kbd>
              </Button>
              <Button variant="secondary" onClick={() => setMode("send_back")} icon={<CornerUpLeft className="h-4 w-4" aria-hidden />}>
                Send back <kbd className="rounded border border-line px-1.5 font-mono text-xs">R</kbd>
              </Button>
              <Button variant="danger" onClick={() => setMode("reject")} icon={<X className="h-4 w-4" aria-hidden />}>
                Reject <kbd className="rounded bg-white/20 px-1.5 font-mono text-xs">X</kbd>
              </Button>
              <Button variant="ghost" onClick={skip} disabled={queue.length < 2} icon={<SkipForward className="h-4 w-4" aria-hidden />}>
                Skip <kbd className="rounded border border-line px-1.5 font-mono text-xs">S</kbd>
              </Button>
              <Link href={`/questions/view?id=${current.id}&edit=1`} className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary hover:bg-border-tint">
                <Pencil className="h-4 w-4" aria-hidden /> Edit <kbd className="rounded border border-line px-1.5 font-mono text-xs">E</kbd>
              </Link>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
