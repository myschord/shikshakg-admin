"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import type { QuizDay } from "@/lib/api/a8";
import { formatDay, todayIst } from "@/lib/date";
import { useQuizDays, useQuizMutations } from "@/lib/hooks/useA8";
import { useCategories } from "@/lib/hooks/useExamEvents";
import { useTests } from "@/lib/hooks/usePapers";

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });

/** Which test is each day's quiz for an exam. Today and the next two weeks can be set; earlier days are kept as they were. */
export default function DailyQuizScreen() {
  const categories = useCategories();
  const [chosen, setChosen] = useState("");
  const exam = chosen || categories.data?.[0]?.exams[0]?.slug || null;
  const today = todayIst();
  const from = addDays(today, -7);
  const to = addDays(today, 14);
  const q = useQuizDays(exam, from, to);
  const m = useQuizMutations(exam);
  const byDate = useMemo(() => new Map((q.data ?? []).map((d) => [d.date, d])), [q.data]);
  const days = useMemo(() => Array.from({ length: 22 }, (_, i) => addDays(from, i)), [from]);
  const [pick, setPick] = useState<string | null>(null);
  const [clear, setClear] = useState<string | null>(null);
  const gaps = [0, 1, 2].map((n) => addDays(today, n)).filter((d) => !byDate.has(d));

  type Row = { date: string; quiz: QuizDay | undefined };
  const rows: Row[] = days.map((date) => ({ date, quiz: byDate.get(date) }));
  const columns: Column<Row>[] = [
    {
      key: "d",
      header: "Day",
      cell: (r) => (
        <span className="whitespace-nowrap">
          <strong>{formatDay(r.date)}</strong> <span className="text-xs text-ink-muted">{weekday(r.date)}</span>
          {r.date === today && <Badge tone="info" className="ml-2">Today</Badge>}
        </span>
      ),
    },
    { key: "t", header: "Quiz", cell: (r) => (r.quiz ? r.quiz.test_title : r.date < today ? <span className="text-ink-muted">None was set</span> : <span className="font-semibold text-warning-text">Not set</span>) },
    {
      key: "a",
      header: "Actions",
      cell: (r) =>
        r.date < today ? null : (
          <div className="flex flex-wrap gap-2">
            <Button variant={r.quiz ? "secondary" : "primary"} className="!min-h-[36px] !px-3" onClick={() => setPick(r.date)}>
              {r.quiz ? "Change" : "Choose a test"}
              <span className="sr-only"> for {formatDay(r.date)}</span>
            </Button>
            {r.quiz && r.date > today && (
              <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setClear(r.date)}>
                Remove<span className="sr-only"> the quiz for {formatDay(r.date)}</span>
              </Button>
            )}
          </div>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Daily quiz</h1>
        <p className="mt-1 text-sm text-ink-muted">Pick the published test students see as the quiz of each day. The day changes at midnight India time.</p>
      </div>
      <Field label="Exam" className="max-w-sm">{(p) => <ExamSelect {...p} value={exam ?? ""} onChange={setChosen} />}</Field>
      {gaps.length > 0 && !q.isPending && !q.isError && (
        <p role="note" className="rounded-xl border border-warning bg-warning-tint p-3 text-sm">
          No quiz is set for {gaps.map((d) => formatDay(d)).join(", ")}. Students see no daily quiz on those days.
        </p>
      )}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isPending || !exam ? <Skeleton className="h-64" /> : <DataTable caption="Daily quiz by day" columns={columns} rows={rows} rowKey={(r) => r.date} empty={null} />}
      {exam && pick && <PickDialog exam={exam} date={pick} current={byDate.get(pick)} onClose={() => setPick(null)} />}
      <ConfirmDialog
        open={!!clear}
        title="Remove this day's quiz?"
        confirmLabel="Remove"
        danger
        busy={m.clear.isPending}
        error={m.clear.error}
        onCancel={() => {
          m.clear.reset();
          setClear(null);
        }}
        onConfirm={async () => {
          if (!clear) return;
          try {
            await m.clear.mutateAsync(clear);
            toast.success("Removed.");
            setClear(null);
          } catch {}
        }}
      >
        {clear && <p>Students will see no daily quiz on {formatDay(clear)} unless you choose another test.</p>}
      </ConfirmDialog>
    </div>
  );
}

function PickDialog({ exam, date, current, onClose }: { exam: string; date: string; current?: QuizDay; onClose: () => void }) {
  const tests = useTests({ exam, status: "published" });
  const m = useQuizMutations(exam);
  const rows = useMemo(() => tests.data?.pages.flatMap((p) => p.items) ?? [], [tests.data]);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(current?.test_id ?? "");
  useEffect(() => {
    if (tests.hasNextPage && !tests.isFetchingNextPage) void tests.fetchNextPage();
  }, [tests]);
  const shown = rows.filter((t) => !text.trim() || t.title.toLowerCase().includes(text.trim().toLowerCase()));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = rows.find((x) => x.id === picked);
    if (!t) return;
    try {
      await m.set.mutateAsync({ date, test: { id: t.id, title: t.title } });
      toast.success(`Quiz set for ${formatDay(date)}.`);
      onClose();
    } catch {}
  }

  return (
    <Dialog open title={`Quiz for ${formatDay(date)}`} onClose={onClose} busy={m.set.isPending} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Find a test" help="Only published tests of this exam are listed.">{(p) => <input {...p} type="search" value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />}</Field>
        <div role="radiogroup" aria-label="Choose the test" className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
          {tests.isPending ? (
            <Skeleton className="h-16" />
          ) : shown.length === 0 ? (
            <p className="p-3 text-sm text-ink-muted">No published test matches. Publish a test first.</p>
          ) : (
            shown.map((t) => (
              <label key={t.id} className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg p-2 text-sm ${picked === t.id ? "bg-border-tint" : "hover:bg-bg-tint"}`}>
                <input type="radio" name="quiz-test" value={t.id} checked={picked === t.id} onChange={() => setPicked(t.id)} className="mt-1 h-4 w-4 accent-primary" />
                <span>
                  <span className="font-semibold">{t.title}</span>
                  <span className="block text-xs text-ink-muted">{t.total_questions} questions</span>
                </span>
              </label>
            ))
          )}
        </div>
        {m.set.error ? <ErrorState compact error={m.set.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={m.set.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={!picked} loading={m.set.isPending}>
            Set as the quiz
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
