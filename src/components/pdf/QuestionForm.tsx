"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import Button from "@/components/kit/Button";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { isApiError } from "@/lib/api/errors";
import { ISSUES, type PdfQuestion, type PdfQuestionUpdate } from "@/lib/api/pdf";
import { TYPE_LABEL, type Difficulty, type QuestionType } from "@/lib/api/questions";
import { useExam } from "@/lib/hooks/useExamEvents";
import { usePdfMutations } from "@/lib/hooks/useImports";
import { useSyllabus } from "@/lib/hooks/useQuestions";

type Props = { question: PdfQuestion; documentId: string; onDecided: () => void; noteRef: React.RefObject<HTMLInputElement | null>; mode: "view" | "reject"; setMode: (m: "view" | "reject") => void };

/** Everything the system read for one question, editable, with the checks it could not pass spelled out. */
export default function QuestionForm({ question: q, documentId, onDecided, noteRef, mode, setMode }: Props) {
  const m = usePdfMutations(documentId);
  const locked = !!q.imported_question_id || q.import_job_id != null;
  const keys = useMemo(() => [...new Set(["A", "B", "C", "D", ...Object.keys(q.options ?? {})])].sort(), [q.options]);

  const [stem, setStem] = useState("");
  const [options, setOptions] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState("");
  const [exam, setExam] = useState("");
  const [stage, setStage] = useState("");
  const [paperCode, setPaperCode] = useState("");
  const [paperTitle, setPaperTitle] = useState("");
  const [date, setDate] = useState("");
  const [topic, setTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [qtype, setQtype] = useState("");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Start from what the system read each time a different question (or a saved version of it) is shown.
  useEffect(() => {
    setStem(q.stem ?? "");
    setOptions(Object.fromEntries(keys.map((k) => [k, q.options?.[k] ?? ""])));
    setAnswer(q.answer ?? "");
    setExam(q.exam_slug ?? "");
    setStage(q.stage_slug ?? "");
    setPaperCode(q.paper_code ?? "");
    setPaperTitle(q.paper_title ?? "");
    setDate(q.source_date ?? "");
    setTopic(q.topic_slug ?? "");
    setSubtopic(q.subtopic_slug ?? "");
    setDifficulty(q.difficulty ?? "");
    setQtype(q.question_type ?? "");
    setNote("");
    setNoteError(null);
    setError(null);
  }, [q.id, q.version, keys]);

  const examData = useExam(exam || null);
  const stages = examData.data?.stages ?? [];
  const syllabus = useSyllabus(exam || null, stage || (stages.length === 1 ? stages[0].slug : null) || stages[0]?.slug || null);
  const subject = syllabus.data?.subjects.find((s) => s.slug === q.subject_slug);
  const topics = subject?.topics ?? [];
  const subtopics = topics.find((t) => t.slug === topic)?.subtopics ?? [];

  /** Only what the editor changed is sent, so a save never overwrites something the system refined meanwhile. */
  const diff = useMemo(() => {
    const d: Partial<Omit<PdfQuestionUpdate, "expected_version">> = {};
    if (stem !== (q.stem ?? "")) d.stem = stem;
    if (keys.some((k) => (options[k] ?? "") !== (q.options?.[k] ?? ""))) d.options = options;
    if (answer && answer !== (q.answer ?? "")) d.answer = answer as PdfQuestionUpdate["answer"];
    if (exam && exam !== (q.exam_slug ?? "")) d.exam_slug = exam;
    if (stage && stage !== (q.stage_slug ?? "")) d.stage_slug = stage;
    if (paperCode !== (q.paper_code ?? "")) d.paper_code = paperCode || null;
    if (paperTitle !== (q.paper_title ?? "")) d.paper_title = paperTitle || null;
    if (date && date !== (q.source_date ?? "")) d.source_date = date;
    if (topic && topic !== (q.topic_slug ?? "")) d.topic_slug = topic;
    if (!topic && q.topic_slug) d.clear_topic = true;
    if (subtopic && subtopic !== (q.subtopic_slug ?? "")) d.subtopic_slug = subtopic;
    if (difficulty && difficulty !== (q.difficulty ?? "")) d.difficulty = difficulty as Difficulty;
    if (qtype && qtype !== (q.question_type ?? "")) d.question_type = qtype as QuestionType;
    return d;
  }, [stem, options, answer, exam, stage, paperCode, paperTitle, date, topic, subtopic, difficulty, qtype, q, keys]);
  const dirty = Object.keys(diff).length > 0;

  async function save(): Promise<PdfQuestion | null> {
    if (!dirty) return q;
    try {
      return await m.update.mutateAsync({ id: q.id, body: { expected_version: q.version, clear_topic: false, ...diff } });
    } catch (err) {
      setError(err);
      return null;
    }
  }

  async function approve() {
    setError(null);
    const saved = await save();
    if (!saved) return;
    try {
      await m.review.mutateAsync({ id: q.id, status: "approved" });
      onDecided();
    } catch (err) {
      setError(err);
    }
  }

  async function reject() {
    if (!note.trim()) {
      setNoteError("Say briefly why, so it can be found later.");
      noteRef.current?.focus();
      return;
    }
    try {
      await m.review.mutateAsync({ id: q.id, status: "rejected", note: note.trim() });
      setMode("view");
      onDecided();
    } catch (err) {
      setError(err);
    }
  }

  const blocked = isApiError(error) && error.code === "not_approvable";
  const stale = isApiError(error) && error.code === "stale_version";
  const busy = m.update.isPending || m.review.isPending;
  const issues = q.issues.map((i) => ({ id: i, ...(ISSUES[i] ?? { label: i, help: "", blocking: false }) }));
  const ocrKeys = Object.keys(q.ocr_text ?? {});

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void approve();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-bg-tint px-2.5 py-1 text-sm font-bold tabular-nums text-primary-dark">Q{q.number}</span>
        <span className="text-xs text-ink-muted">Section {q.section} · page {q.first_page}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${q.review_status === "approved" ? "bg-success/10 text-success-text" : q.review_status === "rejected" ? "bg-error/10 text-error-text" : "bg-warning/15 text-warning-text"}`}>
          {q.review_status === "pending" ? "Waiting for you" : q.review_status === "approved" ? "Approved" : "Rejected"}
        </span>
        {locked && q.imported_question_id && (
          <Link href={`/questions/view?id=${q.imported_question_id}`} className="text-xs font-semibold text-primary hover:underline">
            Imported: open the question
          </Link>
        )}
      </div>

      {issues.length > 0 && (
        <ul aria-label="Checks that need attention" className="space-y-1.5">
          {issues.map((i) => (
            <li key={i.id} className={`rounded-lg border px-3 py-2 text-sm ${i.blocking ? "border-error/25 bg-error/5" : "border-warning/30 bg-warning/10"}`}>
              <span className={`font-semibold ${i.blocking ? "text-error-text" : "text-warning-text"}`}>{i.label}</span>
              {i.blocking && <span className="ml-2 text-xs font-semibold text-error-text">Must fix before approving</span>}
              {i.help && <span className="block text-xs text-ink">{i.help}</span>}
            </li>
          ))}
        </ul>
      )}

      <fieldset disabled={locked} className="space-y-4">
        <Field label="Question" required>
          {(p) => <textarea {...p} lang={q.language} rows={4} value={stem} onChange={(e) => setStem(e.target.value)} className={`${inputClass} py-2`} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {keys.map((k) => (
            <Field key={k} label={`Option ${k}`}>
              {(p) => <input {...p} lang={q.language} value={options[k] ?? ""} onChange={(e) => setOptions((o) => ({ ...o, [k]: e.target.value }))} className={inputClass} />}
            </Field>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Correct answer" required help={q.key_answer || q.solver_answer ? `PDF key: ${q.key_answer ?? "none"} · AI solver: ${q.solver_answer ?? "none"}` : undefined}>
            {(p) => (
              <select {...p} value={answer} onChange={(e) => setAnswer(e.target.value)} className={inputClass}>
                <option value="">Choose…</option>
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Difficulty">
            {(p) => (
              <select {...p} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={inputClass}>
                <option value="">Not set</option>
                {["easy", "medium", "hard"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Kind of question">
            {(p) => (
              <select {...p} value={qtype} onChange={(e) => setQtype(e.target.value)} className={inputClass}>
                <option value="">Not set</option>
                {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-bold">Where this question comes from</legend>
          {q.source_text && (
            <p className="text-xs text-ink-muted sm:col-span-2">
              Cited in the PDF as: <span className="font-semibold text-ink">{q.source_text}</span>
            </p>
          )}
          <Field label="Exam">{(p) => <ExamSelect {...p} value={exam} onChange={(v) => { setExam(v); setStage(""); setTopic(""); setSubtopic(""); }} />}</Field>
          <Field label="Stage">
            {(p) => (
              <select {...p} value={stage} onChange={(e) => { setStage(e.target.value); setTopic(""); setSubtopic(""); }} className={inputClass} disabled={!exam}>
                <option value="">{stages.length > 1 ? "Choose…" : "Only stage"}</option>
                {stages.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Exam date (IST)">{(p) => <input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />}</Field>
          <Field label="Paper code" help="Filled in from the source when it is known.">
            {(p) => <input {...p} value={paperCode} maxLength={64} onChange={(e) => setPaperCode(e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Paper title" className="sm:col-span-2">
            {(p) => <input {...p} value={paperTitle} maxLength={200} onChange={(e) => setPaperTitle(e.target.value)} className={inputClass} />}
          </Field>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Topic${subject ? ` (${subject.name})` : ""}`} help="Needed before the question can be published.">
            {(p) => (
              <select {...p} value={topic} onChange={(e) => { setTopic(e.target.value); setSubtopic(""); }} className={inputClass} disabled={!exam}>
                <option value="">{exam ? "No topic yet" : "Choose an exam first"}</option>
                {topics.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Subtopic">
            {(p) => (
              <select {...p} value={subtopic} onChange={(e) => setSubtopic(e.target.value)} className={inputClass} disabled={!topic}>
                <option value="">None</option>
                {subtopics.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </fieldset>

      {(ocrKeys.length > 0 || Object.keys(q.layer_text ?? {}).length > 0) && (
        <details className="rounded-lg border border-line px-3 text-sm">
          <summary className="min-h-[44px] cursor-pointer py-3 font-semibold text-primary">Compare with the raw text the system read</summary>
          <div className="space-y-2 pb-3 text-xs">
            {q.corrected_fields.length > 0 && <p className="font-semibold text-warning-text">AI help corrected: {q.corrected_fields.join(", ")}</p>}
            {Object.entries(q.layer_text ?? {}).map(([k, v]) => (
              <p key={`l${k}`}>
                <span className="font-semibold">Text in the PDF ({k}):</span> {v}
              </p>
            ))}
            {Object.entries(q.ocr_text ?? {}).map(([k, v]) => (
              <p key={`o${k}`}>
                <span className="font-semibold">Read from the scan ({k}):</span> {v}
              </p>
            ))}
          </div>
        </details>
      )}

      {error ? (
        <div>
          <ErrorState compact error={error} />
          {blocked && <p className="mt-1 text-sm">Fix the items marked &quot;Must fix&quot; above, save, then approve again.</p>}
          {stale && <p className="mt-1 text-sm">This question changed after you opened it (the system may still have been working on it). Reload the page to see the latest version.</p>}
        </div>
      ) : null}

      {mode === "reject" ? (
        <div className="space-y-2 rounded-xl border border-line bg-white p-3">
          <Field label="Why reject this question?" required error={noteError}>
            {(p) => (
              <input
                {...p}
                ref={noteRef}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void reject();
                  } else if (e.key === "Escape") {
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
          <div className="flex gap-3">
            <Button variant="danger" onClick={reject} loading={m.review.isPending}>
              Reject <span className="text-xs opacity-80">(Enter)</span>
            </Button>
            <Button variant="secondary" onClick={() => { setMode("view"); setNote(""); setNoteError(null); }}>
              Cancel <span className="text-xs opacity-70">(Esc)</span>
            </Button>
          </div>
        </div>
      ) : (
        !locked && (
          <div role="group" aria-label="Decide" className="sticky bottom-3 flex flex-wrap gap-3 rounded-xl border border-line bg-white p-3 shadow-md">
            <Button id="pdf-approve" type="submit" loading={busy} icon={<Check className="h-4 w-4" aria-hidden />}>
              {dirty ? "Save and approve" : "Approve"} <kbd className="rounded bg-white/20 px-1.5 font-mono text-xs">Ctrl+Enter</kbd>
            </Button>
            <Button variant="secondary" onClick={() => void save()} disabled={!dirty || busy}>
              Save changes
            </Button>
            <Button variant="danger" onClick={() => setMode("reject")} icon={<X className="h-4 w-4" aria-hidden />}>
              Reject
            </Button>
          </div>
        )
      )}
    </form>
  );
}
