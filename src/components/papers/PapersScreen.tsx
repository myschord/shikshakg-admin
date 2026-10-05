"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";
import PaperForm from "@/components/papers/PaperForm";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field from "@/components/kit/Field";
import type { Paper } from "@/lib/api/papers";
import { formatDay } from "@/lib/date";
import { useCategories, useExam } from "@/lib/hooks/useExamEvents";
import { usePaperMutations, usePapers } from "@/lib/hooks/usePapers";

const TONE = { draft: "warning", published: "success", archived: "neutral" } as const;

/** Past papers for one exam. A paper becomes a test once it is published and has published questions. */
export default function PapersScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const categories = useCategories();
  const first = categories.data?.[0]?.exams[0]?.slug ?? "";
  const exam = params.get("exam") || first || null;
  const examData = useExam(exam);
  const examName = examData.data ? examData.data.short_name || examData.data.name : (exam ?? "");
  const list = usePapers(exam);
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const m = usePaperMutations();
  const [form, setForm] = useState<{ paper?: Paper } | null>(null);
  const [action, setAction] = useState<{ type: "publish" | "unpublish"; paper: Paper } | null>(null);

  const columns: Column<Paper>[] = [
    {
      key: "p",
      header: "Paper",
      cell: (p) => (
        <>
          <span className="font-semibold">{p.title}</span>
          <span className="block font-mono text-xs text-ink-muted">{p.paper_code}</span>
        </>
      ),
    },
    { key: "s", header: "Stage", cell: (p) => p.stage.name },
    { key: "d", header: "Date", cell: (p) => <span className="whitespace-nowrap">{p.exam_date ? formatDay(p.exam_date) : p.year}</span> },
    {
      key: "st",
      header: "State",
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={TONE[p.status as keyof typeof TONE] ?? "neutral"}>{p.status[0].toUpperCase() + p.status.slice(1)}</Badge>
          {p.is_partial && <Badge tone="info">Partial</Badge>}
          {p.is_free_preview && <Badge tone="info">Free preview</Badge>}
        </div>
      ),
    },
    {
      key: "q",
      header: "Questions",
      cell: (p) => {
        const c = p.question_counts as Record<string, number>;
        const live = c.published ?? 0;
        const all = Object.values(c).reduce((a, b) => a + b, 0);
        return (
          <Link href={`/questions?exam=${p.exam_slug}&paper=${encodeURIComponent(p.paper_code)}`} className="whitespace-nowrap font-semibold text-primary hover:underline">
            {live} published of {all}
            {p.total_questions ? ` (paper has ${p.total_questions})` : ""}
          </Link>
        );
      },
    },
    {
      key: "a",
      header: "Actions",
      cell: (p) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setForm({ paper: p })}>
            Edit<span className="sr-only"> {p.title}</span>
          </Button>
          {p.status === "published" ? (
            <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setAction({ type: "unpublish", paper: p })}>
              Unpublish<span className="sr-only"> {p.title}</span>
            </Button>
          ) : (
            <Button className="!min-h-[36px] !px-3" onClick={() => setAction({ type: "publish", paper: p })}>
              Publish<span className="sr-only"> {p.title}</span>
            </Button>
          )}
          {!p.is_partial && (
            <Link href={`/tests?tab=tests&exam=${p.exam_slug}&paper=${encodeURIComponent(p.paper_code)}`} className="inline-flex min-h-[36px] items-center px-2 text-sm font-semibold text-primary hover:underline">
              Make a test<span className="sr-only"> from {p.title}</span>
            </Link>
          )}
        </div>
      ),
    },
  ];

  const mut = action ? m[action.type] : null;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Papers</h1>
          <p className="mt-1 text-sm text-ink-muted">Past exam papers and the questions that belong to them. Publish a paper, then build a timed test from it.</p>
        </div>
        <Button onClick={() => setForm({})} disabled={!exam || examData.isPending} icon={<Plus className="h-4 w-4" aria-hidden />}>
          New paper
        </Button>
      </div>

      <div className="max-w-sm">
        <Field label="Exam">{(p) => <ExamSelect {...p} value={exam ?? ""} onChange={(v) => router.replace(`${pathname}?exam=${encodeURIComponent(v)}`, { scroll: false })} />}</Field>
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <DataTable caption={`Papers for ${examName}`} columns={columns} rows={rows} rowKey={(p) => p.id} loading={list.isPending || !exam} empty={<><p className="font-semibold text-ink">No papers for this exam yet</p><p className="mt-1">Create one, or upload a PDF in PDF extraction and a paper is made for you.</p></>} />
      )}
      {list.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}

      {exam && (
        <PaperForm
          open={!!form}
          examSlug={exam}
          examName={examName}
          stages={examData.data?.stages ?? []}
          paper={form?.paper}
          onClose={() => setForm(null)}
          onSaved={(p) => {
            setForm(null);
            toast.success(form?.paper ? "Saved." : `Paper ${p.paper_code} created. It is a draft until you publish it.`);
          }}
        />
      )}

      <ConfirmDialog
        open={!!action}
        title={action?.type === "publish" ? "Publish this paper?" : "Unpublish this paper?"}
        confirmLabel={action?.type === "publish" ? "Publish" : "Unpublish"}
        danger={action?.type === "unpublish"}
        busy={mut?.isPending}
        error={mut?.error}
        onCancel={() => {
          mut?.reset();
          setAction(null);
        }}
        onConfirm={async () => {
          if (!action || !mut) return;
          try {
            await mut.mutateAsync(action.paper.paper_code);
            toast.success(action.type === "publish" ? "Paper published." : "Paper unpublished.");
            setAction(null);
          } catch {}
        }}
      >
        {action && (
          <>
            <p className="rounded-lg bg-bg-tint px-3 py-2 text-ink">
              <strong>{action.paper.title}</strong> <span className="font-mono text-xs">{action.paper.paper_code}</span>
            </p>
            {action.type === "publish" ? <p>Students can then see this paper and open its published questions. A paper with no published questions cannot be published.</p> : <p>Students will no longer see this paper or practise from it. Tests already built from it keep working.</p>}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
