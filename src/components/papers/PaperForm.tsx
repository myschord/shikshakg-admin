"use client";

import { useEffect, useState } from "react";
import Button from "@/components/kit/Button";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import type { Paper } from "@/lib/api/papers";
import type { ExamStage } from "@/lib/api/catalog";
import { usePaperMutations } from "@/lib/hooks/usePapers";

const CODE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const https = (v: string) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/** Create a paper, or change one's details. A paper's code, exam and stage are fixed once it exists. */
export default function PaperForm({ open, examSlug, examName, stages, paper, onClose, onSaved }: { open: boolean; examSlug: string; examName: string; stages: ExamStage[]; paper?: Paper; onClose: () => void; onSaved: (p: Paper) => void }) {
  const m = usePaperMutations();
  const edit = !!paper;
  const [stage, setStage] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [date, setDate] = useState("");
  const [shift, setShift] = useState("");
  const [total, setTotal] = useState("");
  const [minutes, setMinutes] = useState("");
  const [correct, setCorrect] = useState("");
  const [negative, setNegative] = useState("");
  const [source, setSource] = useState("");
  const [free, setFree] = useState(false);
  const [partial, setPartial] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    const mk = (paper?.marking ?? {}) as { correct?: number; negative?: number };
    setStage(paper?.stage.slug ?? stages[0]?.slug ?? "");
    setCode(paper?.paper_code ?? "");
    setTitle(paper?.title ?? "");
    setYear(paper ? String(paper.year) : "");
    setDate(paper?.exam_date ?? "");
    setShift(paper?.shift ?? "");
    setTotal(paper?.total_questions ? String(paper.total_questions) : "");
    setMinutes(paper?.duration_seconds ? String(Math.round(paper.duration_seconds / 60)) : "");
    setCorrect(mk.correct != null ? String(mk.correct) : "");
    setNegative(mk.negative != null ? String(mk.negative) : "");
    setSource(paper?.source_url ?? "");
    setFree(paper?.is_free_preview ?? false);
    setPartial(paper?.is_partial ?? false);
    setErrors({});
    setServerError(null);
  }, [open, paper, stages]);

  const busy = m.create.isPending || m.update.isPending;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const er: Record<string, string> = {};
    if (!edit && !stage) er.stage = "Choose the stage.";
    if (!edit && !CODE.test(code.trim())) er.code = "Use letters, digits, dashes and underscores, for example BPSC_2022_PRELIMS.";
    if (!title.trim()) er.title = "Enter a title.";
    const y = Number(year);
    if (!edit && (!Number.isInteger(y) || y < 1950 || y > 2100)) er.year = "Enter a year between 1950 and 2100.";
    if (total && (!Number.isInteger(Number(total)) || Number(total) < 1)) er.total = "Enter a whole number of questions.";
    if (minutes && (!Number.isFinite(Number(minutes)) || Number(minutes) < 1)) er.minutes = "Enter the minutes allowed.";
    if ((correct && !Number.isFinite(Number(correct))) || (negative && !Number.isFinite(Number(negative)))) er.marking = "Marks must be numbers, for example 1 and 0.25.";
    if (negative && !correct) er.marking = "Enter the marks for a correct answer too, or leave both empty to use the stage's default.";
    if (source && !https(source.trim())) er.source = "Use a full link that starts with https://";
    setErrors(er);
    setServerError(null);
    if (Object.keys(er).length) return;

    const marking = correct ? { correct: Number(correct), negative: negative ? Number(negative) : 0 } : {};
    try {
      let saved: Paper;
      if (edit && paper) {
        saved = await m.update.mutateAsync({
          code: paper.paper_code,
          body: { title: title.trim(), exam_date: date || null, shift: shift.trim() || null, total_questions: total ? Number(total) : null, duration_seconds: minutes ? Math.round(Number(minutes) * 60) : null, marking, source_url: source.trim() || null, is_free_preview: free, is_partial: partial },
        });
      } else {
        saved = await m.create.mutateAsync({
          exam_slug: examSlug,
          stage_slug: stage,
          paper_code: code.trim(),
          year: y,
          title: title.trim(),
          exam_date: date || null,
          shift: shift.trim() || null,
          total_questions: total ? Number(total) : null,
          duration_seconds: minutes ? Math.round(Number(minutes) * 60) : null,
          marking,
          source_url: source.trim() || null,
          is_free_preview: free,
          is_partial: partial,
        });
      }
      onSaved(saved);
    } catch (err) {
      setServerError(err);
    }
  }

  return (
    <Dialog open={open} title={edit ? `Edit paper ${paper?.paper_code}` : `New paper: ${examName}`} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {!edit && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Stage" required error={errors.stage}>
              {(p) => (
                <select {...p} value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {stages.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Paper code" required error={errors.code} help="Cannot be changed later.">
              {(p) => <input {...p} value={code} maxLength={64} onChange={(e) => setCode(e.target.value)} className={`${inputClass} font-mono`} />}
            </Field>
            <Field label="Year" required error={errors.year}>
              {(p) => <input {...p} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} className={inputClass} />}
            </Field>
          </div>
        )}
        <Field label="Title" required error={errors.title} help="For example: BPSC Prelims 2022, Shift 1">
          {(p) => <input {...p} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClass} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Exam date (IST)">{(p) => <input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />}</Field>
          <Field label="Shift">{(p) => <input {...p} value={shift} maxLength={40} onChange={(e) => setShift(e.target.value)} className={inputClass} placeholder="Shift 1" />}</Field>
          <Field label="Official source link" error={errors.source}>
            {(p) => <input {...p} type="url" value={source} placeholder="https://" onChange={(e) => setSource(e.target.value)} className={inputClass} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Questions in the paper" error={errors.total} help="As printed. Optional.">
            {(p) => <input {...p} inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/\D/g, ""))} className={inputClass} />}
          </Field>
          <Field label="Time allowed (minutes)" error={errors.minutes} help="Blank: 1 minute per question.">
            {(p) => <input {...p} inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} />}
          </Field>
          <Field label="Marks for a correct answer" error={errors.marking} help="Blank: the stage default.">
            {(p) => <input {...p} inputMode="decimal" value={correct} onChange={(e) => setCorrect(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} />}
          </Field>
          <Field label="Marks lost for a wrong answer" help="For example 0.25">
            {(p) => <input {...p} inputMode="decimal" value={negative} onChange={(e) => setNegative(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} />}
          </Field>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">Options</legend>
          <label className="flex min-h-[44px] items-start gap-2 text-sm">
            <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <span>
              Free preview
              <span className="block text-xs text-ink-muted">Students can read this paper&apos;s questions without a plan.</span>
            </span>
          </label>
          <label className="flex min-h-[44px] items-start gap-2 text-sm">
            <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <span>
              Only part of this paper is known
              <span className="block text-xs text-ink-muted">Questions came from a compilation book. A partial paper cannot be offered as a full test.</span>
            </span>
          </label>
        </fieldset>
        {serverError ? <ErrorState compact error={serverError} /> : null}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {edit ? "Save changes" : "Create paper"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
