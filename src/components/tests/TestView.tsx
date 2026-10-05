"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Copy, Lock } from "lucide-react";
import { toast } from "react-toastify";
import { testTone } from "@/components/tests/TestsScreen";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ErrorState from "@/components/kit/ErrorState";
import { useExamNames } from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { isApiError } from "@/lib/api/errors";
import { TEST_STATUS_LABEL } from "@/lib/api/papers";
import { checkedLabel, fromIstLocalInput, toIstLocalInput } from "@/lib/date";
import { useSeries, useTest, useTestMutations } from "@/lib/hooks/usePapers";
import { useQuestionList } from "@/lib/hooks/useQuestions";

type Section = { id: string; position: number; name: string; question_count: number; correct_marks: string; negative_marks: string; duration_seconds: number | null };

export default function TestView() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const test = useTest(id);
  const names = useExamNames();
  const m = useTestMutations();
  const [action, setAction] = useState<"publish" | "archive" | "version" | null>(null);

  if (!id) return <p className="text-sm">No test selected. <Link href="/tests" className="font-semibold text-primary underline">Back to tests</Link></p>;
  if (test.isPending) return <Skeleton className="mx-auto h-72 max-w-5xl" />;
  if (test.isError) return <div className="mx-auto max-w-5xl"><ErrorState error={test.error} onRetry={() => test.refetch()} /></div>;
  const t = test.data;
  const locked = !!t.locked_at;
  const sections = t.sections as Section[];
  const mut = action === "publish" ? m.publish : action === "archive" ? m.archive : m.newVersion;

  const columns: Column<Section>[] = [
    { key: "n", header: "Section", cell: (s) => <span className="font-semibold">{s.name}</span> },
    { key: "q", header: "Questions", align: "right", cell: (s) => s.question_count },
    { key: "c", header: "Marks for correct", align: "right", cell: (s) => Number(s.correct_marks) },
    { key: "w", header: "Marks lost for wrong", align: "right", cell: (s) => Number(s.negative_marks) },
    { key: "d", header: "Time", align: "right", cell: (s) => (s.duration_seconds ? `${Math.round(s.duration_seconds / 60)} min` : "Shared") },
  ];

  async function runAction() {
    try {
      const out = await mut.mutateAsync(t.id);
      setAction(null);
      if (action === "version") {
        toast.success("A new draft version was made. Edit it, then publish it to replace this one.");
        router.push(`/tests/view?id=${out.id}`);
      } else toast.success(action === "publish" ? "Test published." : "Test archived.");
    } catch {}
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/tests" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All tests
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
          <Badge tone={testTone(t.status)}>{TEST_STATUS_LABEL[t.status] ?? t.status}</Badge>
          <span className="text-sm text-ink-muted">Version {t.version}</span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {names.get(t.exam_slug) ?? t.exam_slug} · {t.total_questions} questions · {Number(t.total_marks)} marks · {Math.round(t.duration_seconds / 60)} minutes{t.is_free_preview ? " · free preview" : ""}
        </p>
      </div>

      {locked && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-primary/25 bg-border-tint px-4 py-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary-dark" aria-hidden />
          <span>
            <strong>Students have attempted this test</strong> (first attempt {checkedLabel(t.locked_at as string)}), so its questions are frozen to keep every result fair. To change a question, make a new version, edit that, and publish it. Publishing the new version archives this one.
          </span>
        </p>
      )}

      <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-white p-3">
        {t.status === "draft" && <Button onClick={() => { m.publish.reset(); setAction("publish"); }}>Publish</Button>}
        {t.status !== "archived" && (
          <Button variant="secondary" onClick={() => { m.newVersion.reset(); setAction("version"); }} icon={<Copy className="h-4 w-4" aria-hidden />}>
            Make a new version
          </Button>
        )}
        {t.status !== "archived" && (
          <Button variant="ghost" className="text-error-text" onClick={() => { m.archive.reset(); setAction("archive"); }}>
            Archive
          </Button>
        )}
      </div>

      <section aria-labelledby="sec-h" className="space-y-3">
        <h2 id="sec-h" className="text-lg font-bold">
          Sections and marking
        </h2>
        <DataTable caption="Test sections" columns={columns} rows={sections} rowKey={(s) => s.id} empty="No sections." />
      </section>

      <Details key={`${t.id}:${t.version}:${t.status}`} test={t} />
      <ReplaceQuestion test={t} locked={locked} />

      <ConfirmDialog
        open={!!action}
        title={action === "publish" ? "Publish this test?" : action === "archive" ? "Archive this test?" : "Make a new version?"}
        confirmLabel={action === "publish" ? "Publish" : action === "archive" ? "Archive" : "Make a copy to edit"}
        danger={action === "archive"}
        busy={mut.isPending}
        error={mut.error}
        onCancel={() => {
          mut.reset();
          setAction(null);
        }}
        onConfirm={runAction}
      >
        {action === "publish" && <p>Students can find and attempt this test straight away. {t.version > 1 ? "The version it replaces is archived in the same step. " : ""}Once someone attempts it, its questions are frozen.</p>}
        {action === "archive" && <p>Students can no longer start this test. Results of attempts already made are kept.</p>}
        {action === "version" && <p>A copy of this test is made as a draft, so you can change its questions without affecting students. The live version stays as it is until you publish the copy.</p>}
      </ConfirmDialog>
    </div>
  );
}

/** Title, series, free preview, position, attempt limit and availability window. */
function Details({ test: t }: { test: ReturnType<typeof useTest>["data"] & object }) {
  const { update } = useTestMutations();
  const series = useSeries(t.exam_slug);
  const [title, setTitle] = useState(t.title);
  const [seriesId, setSeriesId] = useState(t.test_series_id ?? "");
  const [free, setFree] = useState(t.is_free_preview);
  const [position, setPosition] = useState(String(t.position));
  const [attempts, setAttempts] = useState(t.max_attempts ? String(t.max_attempts) : "");
  const [from, setFrom] = useState(toIstLocalInput(t.available_from));
  const [until, setUntil] = useState(toIstLocalInput(t.available_until));
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!title.trim()) er.title = "Enter a title.";
    if (!Number.isInteger(Number(position)) || Number(position) < 0) er.position = "Enter 0 or a positive whole number.";
    if (attempts && (!Number.isInteger(Number(attempts)) || Number(attempts) < 1)) er.attempts = "Enter a whole number, or leave blank for unlimited.";
    if (from && until && until <= from) er.until = "The end must be after the start.";
    setErrors(er);
    if (Object.keys(er).length) return;
    try {
      await update.mutateAsync({
        id: t.id,
        body: { title: title.trim(), test_series_id: seriesId || null, is_free_preview: free, position: Number(position), max_attempts: attempts ? Number(attempts) : null, available_from: from ? fromIstLocalInput(from) : null, available_until: until ? fromIstLocalInput(until) : null },
      });
      toast.success("Saved.");
    } catch {}
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-line bg-white p-5" noValidate aria-labelledby="det-h">
      <h2 id="det-h" className="text-lg font-bold">
        Details
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required error={errors.title}>{(p) => <input {...p} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClass} />}</Field>
        <Field label="Test series">
          {(p) => (
            <select {...p} value={seriesId} onChange={(e) => setSeriesId(e.target.value)} className={inputClass}>
              <option value="">No series</option>
              {(series.data ?? []).filter((s) => s.status !== "archived" || s.id === t.test_series_id).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Position in the series" error={errors.position}>{(p) => <input {...p} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value.replace(/\D/g, ""))} className={inputClass} />}</Field>
        <Field label="Attempts allowed" error={errors.attempts} help="Blank: unlimited.">{(p) => <input {...p} inputMode="numeric" value={attempts} onChange={(e) => setAttempts(e.target.value.replace(/\D/g, ""))} className={inputClass} />}</Field>
        <Field label="Open from (IST)" help="Blank: open now.">{(p) => <input {...p} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />}</Field>
        <Field label="Open until (IST)" error={errors.until} help="Blank: no end.">{(p) => <input {...p} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />}</Field>
      </div>
      <label className="flex min-h-[44px] items-center gap-2 text-sm">
        <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="h-4 w-4 accent-primary" /> Free preview (students without a plan can attempt it)
      </label>
      {update.error ? <ErrorState compact error={update.error} /> : null}
      <Button type="submit" loading={update.isPending}>
        Save details
      </Button>
    </form>
  );
}

/** Swap one question for another published question of the same exam. Not possible once students have attempted the test. */
function ReplaceQuestion({ test: t, locked }: { test: { id: string; exam_slug: string; total_questions: number }; locked: boolean }) {
  const { replaceQuestion } = useTestMutations();
  const [position, setPosition] = useState("1");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState("");
  const [posError, setPosError] = useState<string | null>(null);
  const list = useQuestionList({ exam: t.exam_slug, status: "published" });
  const rows = useMemo(() => (list.data?.pages.flatMap((p) => p.items) ?? []).filter((r) => !text.trim() || r.preview.toLowerCase().includes(text.trim().toLowerCase())), [list.data, text]);

  useEffect(() => {
    if (!list.isFetchingNextPage && list.hasNextPage && text.trim()) void list.fetchNextPage();
  }, [list, text]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pos = Number(position);
    if (!Number.isInteger(pos) || pos < 1 || pos > t.total_questions) return setPosError(`Enter a position from 1 to ${t.total_questions}.`);
    setPosError(null);
    if (!picked) return;
    try {
      await replaceQuestion.mutateAsync({ id: t.id, position: pos, questionId: picked });
      toast.success(`Question ${pos} replaced.`);
      setPicked("");
    } catch {}
  }

  const lockedError = isApiError(replaceQuestion.error) && replaceQuestion.error.code === "test_locked";
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-5" aria-labelledby="rep-h">
      <h2 id="rep-h" className="text-lg font-bold">
        Replace a question
      </h2>
      <p className="text-sm text-ink-muted">
        Swap the question at one position for another published question of this exam. {locked ? "This test has attempts, so make a new version first." : "A question that is already in the test cannot be added again."}
      </p>
      <fieldset disabled={locked} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Position to replace" error={posError} help={`1 to ${t.total_questions}`}>{(p) => <input {...p} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value.replace(/\D/g, ""))} className={inputClass} />}</Field>
          <Field label="Find the new question" className="sm:col-span-2" help="Type part of its text. Only published questions of this exam are listed.">
            {(p) => <input {...p} type="search" value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />}
          </Field>
        </div>
        {!locked && <div role="radiogroup" tabIndex={0} aria-label="Choose the new question" className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
          {list.isPending ? <Skeleton className="h-16" /> : rows.length === 0 ? <p className="p-3 text-sm text-ink-muted">No published question matches.</p> : rows.slice(0, 60).map((r) => (
            <label key={r.id} className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg p-2 text-sm ${picked === r.id ? "bg-border-tint" : "hover:bg-bg-tint"}`}>
              <input type="radio" name="replacement" value={r.id} checked={picked === r.id} onChange={() => setPicked(r.id)} className="mt-1 h-4 w-4 accent-primary" />
              <span>{r.preview.length > 140 ? `${r.preview.slice(0, 140)}…` : r.preview}</span>
            </label>
          ))}
        </div>}
      </fieldset>
      {replaceQuestion.error ? (
        <div>
          <ErrorState compact error={replaceQuestion.error} />
          {lockedError && <p className="mt-1 text-sm">Make a new version of this test, then replace the question there.</p>}
        </div>
      ) : null}
      <Button type="submit" disabled={locked || !picked} loading={replaceQuestion.isPending}>
        Replace the question
      </Button>
    </form>
  );
}
