"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock, Plus } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect, { useExamNames } from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { SERIES_STATUS_LABEL, TEST_STATUS_LABEL, type AdminTest, type Series } from "@/lib/api/papers";
import { usePapers, useSeries, useTestMutations, useTests } from "@/lib/hooks/usePapers";

export const testTone = (s: string) => (s === "published" ? "success" : s === "failed" ? "danger" : s === "archived" ? "neutral" : "warning") as "success" | "danger" | "neutral" | "warning";
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default function TestsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") === "series" ? "series" : "tests";
  const go = (t: string) => router.replace(`${pathname}?tab=${t}`, { scroll: false });
  const [creating, setCreating] = useState(!!params.get("paper"));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Tests</h1>
        <p className="mt-1 text-sm text-ink-muted">Timed tests built from published papers, and the series that group them for students.</p>
      </div>
      <div role="tablist" aria-label="Tests" className="flex gap-2 border-b border-line">
        {(["tests", "series"] as const).map((t) => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} onClick={() => go(t)} className={`-mb-px min-h-[48px] border-b-2 px-4 text-sm font-semibold ${tab === t ? "border-primary text-primary-dark" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {t === "tests" ? "Tests" : "Test series"}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "tests" ? <TestList onCreate={() => setCreating(true)} /> : <SeriesList />}
      </div>
      <CreateTest open={creating} initialExam={params.get("exam") ?? ""} initialPaper={params.get("paper") ?? ""} onClose={() => setCreating(false)} />
    </div>
  );
}

function TestList({ onCreate }: { onCreate: () => void }) {
  const names = useExamNames();
  const [exam, setExam] = useState("");
  const [status, setStatus] = useState("");
  const q = useTests({ exam: exam || undefined, status: status || undefined });
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const columns: Column<AdminTest>[] = [
    {
      key: "t",
      header: "Test",
      cell: (t) => (
        <Link href={`/tests/view?id=${t.id}`} className="font-semibold text-primary hover:underline">
          {t.title}
        </Link>
      ),
    },
    { key: "e", header: "Exam", cell: (t) => names.get(t.exam_slug) ?? t.exam_slug },
    {
      key: "s",
      header: "State",
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={testTone(t.status)}>{TEST_STATUS_LABEL[t.status] ?? t.status}</Badge>
          {t.locked_at && (
            <Badge tone="info">
              <Lock className="mr-1 h-3 w-3" aria-hidden /> Has attempts
            </Badge>
          )}
          {t.is_free_preview && <Badge tone="info">Free preview</Badge>}
        </div>
      ),
    },
    { key: "v", header: "Version", align: "right", cell: (t) => t.version },
    { key: "q", header: "Questions", align: "right", cell: (t) => t.total_questions },
    { key: "m", header: "Marks", align: "right", cell: (t) => Number(t.total_marks) },
    { key: "d", header: "Time", align: "right", cell: (t) => `${Math.round(t.duration_seconds / 60)} min` },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Field label="Exam" className="w-56">{(p) => <ExamSelect {...p} value={exam} onChange={setExam} allLabel="All exams" />}</Field>
          <Field label="State" className="w-44">
            {(p) => (
              <select {...p} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                <option value="">Any</option>
                {["draft", "published", "archived"].map((s) => (
                  <option key={s} value={s}>
                    {TEST_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Button onClick={onCreate} icon={<Plus className="h-4 w-4" aria-hidden />}>
          New test from a paper
        </Button>
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="Tests" columns={columns} rows={rows} rowKey={(t) => t.id} loading={q.isPending} empty="No tests match these filters." />}
      {q.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function CreateTest({ open, initialExam, initialPaper, onClose }: { open: boolean; initialExam: string; initialPaper: string; onClose: () => void }) {
  const router = useRouter();
  const { fromPaper } = useTestMutations();
  const [exam, setExam] = useState(initialExam);
  const [paper, setPaper] = useState(initialPaper);
  const [seriesId, setSeriesId] = useState("");
  const [title, setTitle] = useState("");
  const [free, setFree] = useState(false);
  const [position, setPosition] = useState("0");
  const [attempts, setAttempts] = useState("");
  const [publish, setPublish] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setExam(initialExam);
      setPaper(initialPaper);
      setErrors({});
      fromPaper.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const papers = usePapers(exam || null);
  const series = useSeries(exam || undefined);
  const usable = (papers.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => !p.is_partial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!exam) er.exam = "Choose the exam.";
    if (!paper) er.paper = "Choose the paper.";
    if (!Number.isInteger(Number(position)) || Number(position) < 0) er.position = "Enter 0 or a positive whole number.";
    if (attempts && (!Number.isInteger(Number(attempts)) || Number(attempts) < 1)) er.attempts = "Enter a whole number, or leave blank for unlimited.";
    setErrors(er);
    if (Object.keys(er).length) return;
    try {
      const t = await fromPaper.mutateAsync({ paper_code: paper, test_series_id: seriesId || null, title: title.trim() || null, is_free_preview: free, position: Number(position), max_attempts: attempts ? Number(attempts) : null, publish });
      toast.success(publish ? "Test created and published." : "Test created as a draft.");
      onClose();
      router.push(`/tests/view?id=${t.id}`);
    } catch {
      // shown below
    }
  }

  return (
    <Dialog open={open} title="New test from a paper" onClose={onClose} busy={fromPaper.isPending} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exam" required error={errors.exam}>{(p) => <ExamSelect {...p} value={exam} onChange={(v) => { setExam(v); setPaper(""); setSeriesId(""); }} />}</Field>
          <Field label="Paper" required error={errors.paper} help="Partial papers cannot be offered as a full test. The test uses the paper's published questions.">
            {(p) => (
              <select {...p} value={paper} onChange={(e) => setPaper(e.target.value)} className={inputClass} disabled={!exam || papers.isPending}>
                <option value="">{exam ? "Choose…" : "Pick an exam first"}</option>
                {usable.map((x) => (
                  <option key={x.paper_code} value={x.paper_code}>
                    {x.title} ({x.paper_code}) · {(x.question_counts as Record<string, number>).published ?? 0} published
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Test series" help="Optional. A test outside any series still works.">
            {(p) => (
              <select {...p} value={seriesId} onChange={(e) => setSeriesId(e.target.value)} className={inputClass} disabled={!exam}>
                <option value="">No series</option>
                {(series.data ?? []).filter((s) => s.status !== "archived").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Title" help="Blank: the paper's title.">{(p) => <input {...p} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClass} />}</Field>
          <Field label="Position in the series" error={errors.position}>{(p) => <input {...p} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value.replace(/\D/g, ""))} className={inputClass} />}</Field>
          <Field label="Attempts allowed" error={errors.attempts} help="Blank: unlimited.">{(p) => <input {...p} inputMode="numeric" value={attempts} onChange={(e) => setAttempts(e.target.value.replace(/\D/g, ""))} className={inputClass} />}</Field>
        </div>
        <label className="flex min-h-[44px] items-start gap-2 text-sm">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
          <span>
            Free preview
            <span className="block text-xs text-ink-muted">Students without a plan can attempt this test.</span>
          </span>
        </label>
        <label className="flex min-h-[44px] items-start gap-2 text-sm">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
          <span>
            Publish straight away
            <span className="block text-xs text-ink-muted">Leave off to check it first. Once students attempt a test its questions are frozen.</span>
          </span>
        </label>
        {fromPaper.error ? <ErrorState compact error={fromPaper.error} /> : null}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={fromPaper.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={fromPaper.isPending}>
            Create test
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SeriesList() {
  const names = useExamNames();
  const [exam, setExam] = useState("");
  const q = useSeries(exam || undefined);
  const [form, setForm] = useState<{ series?: Series } | null>(null);
  const columns: Column<Series>[] = [
    { key: "t", header: "Series", cell: (s) => <><span className="font-semibold">{s.title}</span><span className="block font-mono text-xs text-ink-muted">{s.slug}</span></> },
    { key: "e", header: "Exam", cell: (s) => names.get(s.exam_slug) ?? s.exam_slug },
    { key: "st", header: "State", cell: (s) => <Badge tone={s.status === "published" ? "success" : s.status === "archived" ? "neutral" : "warning"}>{SERIES_STATUS_LABEL[s.status] ?? s.status}</Badge> },
    { key: "n", header: "Tests", align: "right", cell: (s) => s.test_count },
    { key: "o", header: "Order", align: "right", cell: (s) => s.display_order },
    { key: "a", header: "Action", cell: (s) => <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setForm({ series: s })}>Edit<span className="sr-only"> {s.title}</span></Button> },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Exam" className="w-56">{(p) => <ExamSelect {...p} value={exam} onChange={setExam} allLabel="All exams" />}</Field>
        <Button onClick={() => setForm({})} icon={<Plus className="h-4 w-4" aria-hidden />}>
          New series
        </Button>
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="Test series" columns={columns} rows={q.data} rowKey={(s) => s.id} loading={q.isPending} empty="No test series yet. A series groups tests for students, for example &quot;BPSC Prelims mocks&quot;." />}
      <SeriesDialog state={form} defaultExam={exam} onClose={() => setForm(null)} />
    </div>
  );
}

function SeriesDialog({ state, defaultExam, onClose }: { state: { series?: Series } | null; defaultExam: string; onClose: () => void }) {
  const { createSeries, updateSeries } = useTestMutations();
  const s = state?.series;
  const [exam, setExam] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState("0");
  const [status, setStatus] = useState("draft");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = createSeries.isPending || updateSeries.isPending;

  useEffect(() => {
    if (!state) return;
    setExam(s?.exam_slug ?? defaultExam);
    setSlug(s?.slug ?? "");
    setTitle(s?.title ?? "");
    setDescription(s?.description ?? "");
    setOrder(String(s?.display_order ?? 0));
    setStatus(s?.status ?? "draft");
    setErrors({});
    createSeries.reset();
    updateSeries.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!s && !exam) er.exam = "Choose the exam.";
    if (!s && !SLUG.test(slug)) er.slug = "Use lowercase letters, digits and single dashes, for example bpsc-prelims-mocks.";
    if (!title.trim() && !s) er.title = "Enter a title.";
    if (!Number.isInteger(Number(order)) || Number(order) < 0 || Number(order) > 10000) er.order = "Enter a number from 0 to 10000.";
    setErrors(er);
    if (Object.keys(er).length) return;
    try {
      if (s) await updateSeries.mutateAsync({ id: s.id, body: { description: description.trim() || null, display_order: Number(order), status: status as "draft" | "published" | "archived" } });
      else await createSeries.mutateAsync({ exam_slug: exam, slug, title: title.trim(), description: description.trim() || null, display_order: Number(order) });
      toast.success(s ? "Saved." : "Series created as a draft.");
      onClose();
    } catch {}
  }

  return (
    <Dialog open={!!state} title={s ? `Edit ${s.title}` : "New test series"} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!s && (
          <>
            <Field label="Exam" required error={errors.exam}>{(p) => <ExamSelect {...p} value={exam} onChange={setExam} />}</Field>
            <Field label="Title" required error={errors.title}>{(p) => <input {...p} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClass} />}</Field>
            <Field label="Short code" required error={errors.slug} help="Used in addresses. It cannot be changed later.">{(p) => <input {...p} value={slug} maxLength={80} onChange={(e) => setSlug(e.target.value.toLowerCase())} className={`${inputClass} font-mono`} />}</Field>
          </>
        )}
        <Field label="Description">{(p) => <textarea {...p} rows={2} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} py-2`} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Order on the page" error={errors.order} help="Lower numbers come first.">{(p) => <input {...p} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value.replace(/\D/g, ""))} className={inputClass} />}</Field>
          {s && (
            <Field label="State" help="Students see published series only.">
              {(p) => (
                <select {...p} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                  {Object.entries(SERIES_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>
        {createSeries.error || updateSeries.error ? <ErrorState compact error={createSeries.error ?? updateSeries.error} /> : null}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {s ? "Save changes" : "Create series"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
