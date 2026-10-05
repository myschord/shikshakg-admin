"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { toast } from "react-toastify";
import { StatusBadge } from "@/components/questions/parts";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect, { useExamNames } from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { STATUSES, STATUS_LABEL, type QuestionListItem, type QuestionStatus } from "@/lib/api/questions";
import { formatDay, istDay } from "@/lib/date";
import { useQuestionList, useQuestionMutations } from "@/lib/hooks/useQuestions";

const SOURCES = [
  { v: "", label: "Any source" },
  { v: "PYQ", label: "Previous-year" },
  { v: "AI_GENERATED", label: "AI generated" },
  { v: "ADMIN_CREATED", label: "Written by staff" },
] as const;
const BULK: { status: QuestionStatus; label: string }[] = [
  { status: "in_review", label: "Send to review" },
  { status: "published", label: "Publish" },
  { status: "rejected", label: "Reject" },
  { status: "retired", label: "Retire" },
];

/** Every question, filterable, with bulk status changes. The review queue is the "In review" filter in focused mode. */
export default function QuestionList() {
  const names = useExamNames();
  const params = useSearchParams();
  const [exam, setExam] = useState(params.get("exam") ?? "");
  const [status, setStatus] = useState<QuestionStatus | "">((params.get("status") as QuestionStatus | null) ?? "");
  const [source, setSource] = useState<(typeof SOURCES)[number]["v"]>("");
  const [paper, setPaper] = useState(params.get("paper") ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<(typeof BULK)[number] | null>(null);
  const [note, setNote] = useState("");

  const q = useQuestionList({ exam: exam || undefined, status: status || undefined, paper: paper.trim() || undefined, sourceType: source || undefined });
  const { bulk: bulkMut } = useQuestionMutations();
  const rows = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);

  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const columns: Column<QuestionListItem>[] = [
    {
      key: "pick",
      header: "Select",
      cell: (r) => <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select question ${r.question_number ?? ""} ${r.preview.slice(0, 40)}`} className="h-4 w-4 accent-primary" />,
    },
    {
      key: "q",
      header: "Question",
      className: "max-w-md",
      cell: (r) => (
        <Link href={`/questions/view?id=${r.id}`} className="font-semibold text-primary hover:underline">
          {r.preview.length > 110 ? `${r.preview.slice(0, 110)}…` : r.preview || "(no text)"}
        </Link>
      ),
    },
    { key: "exam", header: "Exam", cell: (r) => <span className="whitespace-nowrap">{names.get(r.exam_slug) ?? r.exam_slug}</span> },
    {
      key: "class",
      header: "Subject and topic",
      cell: (r) => (
        <>
          {r.subject_slug}
          <span className={`block text-xs ${r.topic_slug ? "text-ink-muted" : "font-semibold text-warning-text"}`}>{r.topic_slug ?? "Topic missing"}</span>
        </>
      ),
    },
    { key: "src", header: "Source", cell: (r) => <span className="text-xs">{r.source_type === "PYQ" ? `${r.paper_code ?? "PYQ"}${r.question_number ? ` · Q${r.question_number}` : ""}` : r.source_type === "AI_GENERATED" ? "AI" : "Staff"}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "rep", header: "Reports", align: "right", cell: (r) => <span className={r.report_count > 0 ? "font-semibold text-error-text" : "text-ink-muted"}>{r.report_count || "–"}</span> },
    { key: "lang", header: "Languages", cell: (r) => <span className="text-xs uppercase">{r.languages.join(", ")}</span> },
    { key: "upd", header: "Updated", cell: (r) => <span className="whitespace-nowrap text-xs text-ink-muted">{formatDay(istDay(r.updated_at))}</span> },
  ];

  async function runBulk() {
    if (!bulk) return;
    try {
      const res = await bulkMut.mutateAsync({ ids: [...picked], status: bulk.status, note });
      toast.success(`${res.changed.length} changed${res.unchanged.length ? `, ${res.unchanged.length} left as they were (not allowed from their current status, or not ready to publish)` : ""}.`);
      setPicked(new Set());
      setBulk(null);
      setNote("");
    } catch {
      // shown in the dialog
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Question bank</h1>
          <p className="mt-1 text-sm text-ink-muted">Every question students can practise from. Only published questions are visible to them.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/questions/review" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold hover:border-primary hover:text-primary">
            <ListChecks className="h-4 w-4" aria-hidden /> Review queue
          </Link>
          <Link href="/questions/new" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark">
            <Plus className="h-4 w-4" aria-hidden /> New question
          </Link>
        </div>
      </div>

      <form role="search" aria-label="Filter questions" className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
        <Field label="Exam">{(p) => <ExamSelect {...p} value={exam} onChange={setExam} allLabel="All exams" />}</Field>
        <Field label="Status">
          {(p) => (
            <select {...p} value={status} onChange={(e) => setStatus(e.target.value as QuestionStatus | "")} className={inputClass}>
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Source">
          {(p) => (
            <select {...p} value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={inputClass}>
              {SOURCES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Paper code">{(p) => <input {...p} value={paper} onChange={(e) => setPaper(e.target.value)} placeholder="For example SSC_CGL_2022" className={inputClass} />}</Field>
      </form>

      {picked.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-border-tint px-4 py-3">
          <p className="text-sm font-semibold">{picked.size} selected</p>
          {BULK.map((b) => (
            <Button key={b.status} variant="secondary" className="!min-h-[36px]" onClick={() => setBulk(b)}>
              {b.label}
            </Button>
          ))}
          <Button variant="ghost" className="!min-h-[36px]" onClick={() => setPicked(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <label className="inline-flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(rows.map((r) => r.id)))} className="h-4 w-4 accent-primary" /> Select all {rows.length} shown
          </label>
          <DataTable caption="Questions" columns={columns} rows={rows} rowKey={(r) => r.id} loading={q.isPending} empty={<p className="font-semibold text-ink">No questions match these filters</p>} rowClassName={(r) => (r.report_count > 0 ? "bg-error/5" : "")} />
          {q.hasNextPage && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!bulk} title={bulk ? `${bulk.label}: ${picked.size} question${picked.size === 1 ? "" : "s"}` : ""} onClose={() => setBulk(null)} busy={bulkMut.isPending}>
        <p className="mb-3 text-sm text-ink-muted">
          {bulk?.status === "published" ? "Published questions become visible to students. A question without a topic or without any language is skipped." : "Questions that cannot move from their current status are left as they are (for example, only a published question can be retired)."}
        </p>
        <Field label="Note (optional)" help="Kept in the audit log.">
          {(p) => <textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} py-2`} />}
        </Field>
        {bulkMut.error ? (
          <div className="mt-3">
            <ErrorState compact error={bulkMut.error} />
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setBulk(null)} disabled={bulkMut.isPending}>
            Cancel
          </Button>
          <Button variant={bulk?.status === "retired" || bulk?.status === "rejected" ? "danger" : "primary"} onClick={runBulk} loading={bulkMut.isPending}>
            {bulk?.label}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
