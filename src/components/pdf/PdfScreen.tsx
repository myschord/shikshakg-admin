"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileUp, RotateCw } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { DOC_STATUS_LABEL, type DocumentMode, type PdfDocument } from "@/lib/api/pdf";
import { checkedLabel } from "@/lib/date";
import { usePdfDocuments, usePdfMutations } from "@/lib/hooks/useImports";
import { useExam } from "@/lib/hooks/useExamEvents";
import { useSyllabus } from "@/lib/hooks/useQuestions";

const MAX_MB = 100;
export const docTone = (s: string) => (s === "extracted" ? "success" : s === "failed" ? "danger" : "warning") as "success" | "danger" | "warning";

export default function PdfScreen() {
  const docs = usePdfDocuments();
  const { upload, resume } = usePdfMutations();
  const input = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<DocumentMode>("compilation");
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const [assist, setAssist] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exam, setExam] = useState("");
  const [stage, setStage] = useState("");
  const [subject, setSubject] = useState("");
  const [paperCode, setPaperCode] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const examData = useExam(exam || null);
  const stages = examData.data?.stages ?? [];
  const syllabus = useSyllabus(exam || null, stage || stages[0]?.slug || null);
  const subjects = syllabus.data?.subjects ?? [];
  const rows = useMemo(() => docs.data?.pages.flatMap((p) => p.items) ?? [], [docs.data]);

  function validate() {
    const e: Record<string, string> = {};
    if (!file) e.file = "Choose a PDF file.";
    else if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") e.file = "That is not a PDF file.";
    else if (file.size > MAX_MB * 1024 * 1024) e.file = `That file is larger than ${MAX_MB} MB. Split it into parts.`;
    if (!exam) e.exam = mode === "paper" ? "Choose the paper's exam." : "Choose an exam to pick the subject from.";
    if (!subject) e.subject = "Choose the subject.";
    if (mode === "paper" && !paperCode.trim()) e.paperCode = "A paper needs its code.";
    if (mode === "paper" && !examDate) e.examDate = "A paper needs its exam date.";
    const f = from ? Number(from) : null;
    const t = to ? Number(to) : null;
    if ((from && (!Number.isInteger(f) || (f as number) < 1)) || (to && (!Number.isInteger(t) || (t as number) < 1))) e.range = "Page numbers start at 1.";
    else if (f && t && t < f) e.range = "The last page cannot be before the first page.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length || !file) return;
    try {
      const doc = await upload.mutateAsync({
        file,
        options: {
          subject,
          mode,
          language: lang,
          assist,
          pageFrom: from ? Number(from) : null,
          pageTo: to ? Number(to) : null,
          // A compilation cites its own sources, so exam and stage are only for finding the subject.
          exam: mode === "paper" ? exam : null,
          stage: mode === "paper" ? stage || stages[0]?.slug || null : null,
          paperCode: mode === "paper" ? paperCode.trim() || null : null,
          examDate: mode === "paper" ? examDate || null : null,
          paperTitle: mode === "paper" ? paperTitle.trim() || null : null,
        },
      });
      toast.success(doc.deduplicated ? "That file was uploaded before. Showing the existing document." : "Uploaded. Reading the PDF now. You can leave this page.");
      setFile(null);
      if (input.current) input.current.value = "";
    } catch {
      // shown below
    }
  }

  const columns: Column<PdfDocument>[] = [
    {
      key: "f",
      header: "Document",
      cell: (d) => (
        <>
          <Link href={`/pdf/view?id=${d.id}`} className="font-semibold text-primary hover:underline">
            {d.filename}
          </Link>
          <span className="block text-xs text-ink-muted">{d.mode === "compilation" ? "Compilation" : "Single paper"}</span>
        </>
      ),
    },
    { key: "st", header: "State", cell: (d) => <Badge tone={docTone(d.status)}>{DOC_STATUS_LABEL[d.status]}</Badge> },
    { key: "pg", header: "Pages", align: "right", cell: (d) => d.page_count ?? "–" },
    {
      key: "rv",
      header: "Review",
      cell: (d) => {
        const c = d.review_counts as Record<string, number>;
        return d.status === "extracted" ? (
          <span className="whitespace-nowrap text-xs tabular-nums">
            {c.pending ?? 0} to review · {c.approved ?? 0} approved · {c.rejected ?? 0} rejected
          </span>
        ) : (
          <span className="text-xs text-ink-muted">–</span>
        );
      },
    },
    { key: "when", header: "Uploaded", cell: (d) => <span className="whitespace-nowrap text-xs text-ink-muted">{checkedLabel(d.created_at)}</span> },
    {
      key: "act",
      header: "Action",
      cell: (d) =>
        d.status === "failed" ? (
          <Button
            variant="secondary"
            className="!min-h-[36px]"
            icon={<RotateCw className="h-4 w-4" aria-hidden />}
            onClick={async () => {
              try {
                await resume.mutateAsync(d.id);
                toast.success("Reading restarted.");
              } catch {}
            }}
          >
            Try again<span className="sr-only"> {d.filename}</span>
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">PDF extraction</h1>
        <p className="mt-1 text-sm text-ink-muted">Turn a question book or past paper into questions. The system reads each page, finds the questions, and prepares them for you to check. Nothing reaches the question bank until you approve it and press Import.</p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-line bg-white p-5" noValidate>
        <h2 className="text-lg font-bold">Upload a PDF</h2>
        <Field label="PDF file" required error={errors.file} help={`Up to ${MAX_MB} MB. A long book can take several minutes to read.`}>
          {(p) => <input {...p} ref={input} type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${inputClass} py-2`} />}
        </Field>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold">What is it?</legend>
          {(
            [
              ["compilation", "A compilation book", "Questions from many papers. Each one cites its source (exam and date), which is found automatically."],
              ["paper", "One question paper", "A single exam paper. You say which exam, date and paper it is."],
            ] as const
          ).map(([v, t, d]) => (
            <label key={v} className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${mode === v ? "border-primary bg-border-tint" : "border-line"}`}>
              <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="mt-1 h-4 w-4 accent-primary" />
              <span>
                <span className="block font-semibold">{t}</span>
                <span className="text-xs text-ink-muted">{d}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={mode === "paper" ? "Exam" : "Find the subject in exam"} required error={errors.exam} help={mode === "paper" ? undefined : "Only used to list subjects."}>
            {(p) => <ExamSelect {...p} value={exam} onChange={(v) => { setExam(v); setStage(""); setSubject(""); }} />}
          </Field>
          <Field label="Stage" help={mode === "paper" ? "The stage this paper is for. The first stage is used if you leave it." : "Only used to list subjects."}>
            {(p) => (
              <select {...p} value={stage} onChange={(e) => { setStage(e.target.value); setSubject(""); }} className={inputClass} disabled={!exam}>
                <option value="">{stages[0]?.name ? `${stages[0].name} (first)` : "Default"}</option>
                {stages.slice(1).map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Subject" required error={errors.subject} help="Every question in the PDF gets this subject.">
            {(p) => (
              <select {...p} value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} disabled={!exam || syllabus.isPending}>
                <option value="">{exam ? "Choose…" : "Pick an exam first"}</option>
                {subjects.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Language of the questions">
            {(p) => (
              <select {...p} value={lang} onChange={(e) => setLang(e.target.value as "hi" | "en")} className={inputClass}>
                <option value="hi">Hindi</option>
                <option value="en">English</option>
              </select>
            )}
          </Field>
        </div>

        {mode === "paper" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Paper code" required error={errors.paperCode} help="For example SSC_CGL_2022_T1_S1">
              {(p) => <input {...p} value={paperCode} maxLength={64} onChange={(e) => setPaperCode(e.target.value)} className={inputClass} />}
            </Field>
            <Field label="Exam date" required error={errors.examDate}>{(p) => <input {...p} type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className={inputClass} />}</Field>
            <Field label="Paper title">{(p) => <input {...p} value={paperTitle} maxLength={200} onChange={(e) => setPaperTitle(e.target.value)} className={inputClass} />}</Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="First page" error={errors.range} help="Optional. Leave both blank for the whole PDF.">
            {(p) => <input {...p} inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} className={inputClass} />}
          </Field>
          <Field label="Last page">{(p) => <input {...p} inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} className={inputClass} />}</Field>
          <label className="flex min-h-[44px] items-start gap-2 pt-7 text-sm sm:col-span-2">
            <input type="checkbox" checked={assist} onChange={(e) => setAssist(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <span>
              Use AI help
              <span className="block text-xs text-ink-muted">Fixes words a scan read badly and double-checks answers. You still approve every question.</span>
            </span>
          </label>
        </div>

        {upload.error ? <ErrorState compact error={upload.error} /> : null}
        <Button type="submit" loading={upload.isPending} icon={<FileUp className="h-4 w-4" aria-hidden />}>
          {upload.isPending ? "Uploading…" : "Upload and read"}
        </Button>
      </form>

      <section aria-labelledby="docs-h">
        <h2 id="docs-h" className="mb-3 text-lg font-bold">
          Documents
        </h2>
        {docs.isError ? <ErrorState error={docs.error} onRetry={() => docs.refetch()} /> : <DataTable caption="PDF documents" columns={columns} rows={rows} rowKey={(d) => d.id} loading={docs.isPending} empty="No PDF uploaded yet." />}
        {docs.hasNextPage && (
          <div className="mt-3 text-center">
            <Button variant="secondary" onClick={() => docs.fetchNextPage()} loading={docs.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
