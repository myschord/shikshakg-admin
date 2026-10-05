"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import Button from "@/components/kit/Button";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { isApiError } from "@/lib/api/errors";
import { LANG_LABEL, OPTION_KEYS, TYPE_LABEL, type AdminQuestion, type Difficulty, type Language, type PatternKind, type QuestionType } from "@/lib/api/questions";
import { useExam } from "@/lib/hooks/useExamEvents";
import { useQuestionMutations, useSyllabus } from "@/lib/hooks/useQuestions";

const LANGS: Language[] = ["hi", "en"];
type Tr = { on: boolean; stem: string; options: Record<string, string>; explanation: string };
type Errors = Record<string, string>;

const blankTr = (keys: string[], on: boolean): Tr => ({ on, stem: "", options: Object.fromEntries(keys.map((k) => [k, ""])), explanation: "" });

/**
 * Create or edit a question. Hindi and English sit side by side and share one answer key and one set of option letters.
 * Saving an edit sends the version the form was opened at, so two people never silently overwrite each other.
 */
export default function QuestionEditor({ mode, question, onSaved, onCancel }: { mode: "create" | "edit"; question?: AdminQuestion; onSaved: (q: AdminQuestion) => void; onCancel: () => void }) {
  const m = useQuestionMutations();
  const [exam, setExam] = useState(question?.exam_slug ?? "");
  const [stage, setStage] = useState(question?.stage_slug ?? "");
  const [subject, setSubject] = useState(question?.subject.slug ?? "");
  const [topic, setTopic] = useState(question?.topic?.slug ?? "");
  const [subtopic, setSubtopic] = useState(question?.subtopic?.slug ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>((question?.difficulty as Difficulty) ?? "medium");
  const [qtype, setQtype] = useState<QuestionType>((question?.question_type as QuestionType) ?? "direct_fact");
  const [pattern, setPattern] = useState<PatternKind>((question?.pattern as PatternKind) ?? "single_correct_mcq");
  const [keys, setKeys] = useState<string[]>(() => (question ? Object.keys(question.translations[0]?.options ?? {}).sort() : OPTION_KEYS.slice(0, 4)));
  const [correct, setCorrect] = useState<Set<string>>(new Set(question?.correct_options ?? []));
  const [tr, setTr] = useState<Record<Language, Tr>>(() => {
    const k = question ? Object.keys(question.translations[0]?.options ?? {}).sort() : OPTION_KEYS.slice(0, 4);
    const out = { hi: blankTr(k, mode === "create"), en: blankTr(k, mode === "create") } as Record<Language, Tr>;
    for (const t of question?.translations ?? []) out[t.language as Language] = { on: true, stem: t.stem, options: { ...Object.fromEntries(k.map((x) => [x, ""])), ...t.options }, explanation: t.explanation ?? "" };
    return out;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);

  const examData = useExam(exam || null);
  const stages = examData.data?.stages ?? [];
  const effectiveStage = stage || stages[0]?.slug || null;
  const syllabus = useSyllabus(exam || null, effectiveStage);

  const subjects = useMemo(() => {
    const list = syllabus.data?.subjects ?? [];
    return question && !list.some((s) => s.slug === question.subject.slug) ? [{ slug: question.subject.slug, name: question.subject.name, topics: [] as NonNullable<typeof list>[number]["topics"] }, ...list] : list;
  }, [syllabus.data, question]);
  const topics = subjects.find((s) => s.slug === subject)?.topics ?? [];
  const subtopics = topics.find((t) => t.slug === topic)?.subtopics ?? [];

  // Changing the exam changes what can be chosen below it.
  useEffect(() => {
    if (mode === "create") {
      setSubject("");
      setTopic("");
      setSubtopic("");
    }
  }, [exam, stage, mode]);

  const setOption = (lang: Language, key: string, value: string) => setTr((t) => ({ ...t, [lang]: { ...t[lang], options: { ...t[lang].options, [key]: value } } }));
  const addOption = () => {
    if (keys.length >= OPTION_KEYS.length) return;
    const k = OPTION_KEYS[keys.length];
    setKeys([...keys, k]);
    setTr((t) => ({ hi: { ...t.hi, options: { ...t.hi.options, [k]: "" } }, en: { ...t.en, options: { ...t.en.options, [k]: "" } } }));
  };
  const removeOption = () => {
    if (keys.length <= 2) return;
    const k = keys[keys.length - 1];
    setKeys(keys.slice(0, -1));
    setCorrect((c) => {
      const n = new Set(c);
      n.delete(k);
      return n;
    });
  };
  const toggleCorrect = (k: string) =>
    setCorrect((c) => {
      const n = new Set(pattern === "single_correct_mcq" ? [] : c);
      if (c.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  function validate(): Errors {
    const e: Errors = {};
    if (mode === "create" && !exam) e.exam = "Choose the exam.";
    if (!subject) e.subject = "Choose a subject.";
    const on = LANGS.filter((l) => tr[l].on);
    if (on.length === 0) e.lang = "Include at least one language.";
    for (const l of on) {
      if (!tr[l].stem.trim()) e[`${l}-stem`] = "Write the question.";
      for (const k of keys) if (!tr[l].options[k]?.trim()) e[`${l}-${k}`] = `Option ${k} is empty.`;
    }
    if (correct.size === 0) e.correct = "Mark the correct answer.";
    else if (pattern === "single_correct_mcq" && correct.size !== 1) e.correct = "A single-answer question has exactly one correct option.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setServerError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      // Move to the first problem so keyboard users land on it.
      requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
      return;
    }
    const translations = LANGS.filter((l) => tr[l].on).map((l) => ({
      language: l,
      stem: tr[l].stem.trim(),
      options: Object.fromEntries(keys.map((k) => [k, tr[l].options[k].trim()])),
      explanation: tr[l].explanation.trim() || null,
    }));
    try {
      if (mode === "create") {
        const saved = await m.create.mutateAsync({
          source_type: "ADMIN_CREATED",
          exam_slug: exam,
          stage_slug: stage || null,
          subject_slug: subject,
          topic_slug: topic || null,
          subtopic_slug: subtopic || null,
          difficulty,
          question_type: qtype,
          pattern,
          correct_options: [...correct].sort(),
          translations,
        });
        onSaved(saved);
      } else if (question) {
        const removed = question.translations.map((t) => t.language as Language).filter((l) => !tr[l]?.on);
        const saved = await m.update.mutateAsync({
          id: question.id,
          body: {
            expected_version: question.version,
            subject_slug: subject,
            topic_slug: topic || undefined,
            subtopic_slug: subtopic || undefined,
            clear_subtopic: !subtopic && !!question.subtopic,
            difficulty,
            question_type: qtype,
            pattern,
            correct_options: [...correct].sort(),
            translations,
            remove_languages: removed,
          },
        });
        onSaved(saved);
      }
    } catch (err) {
      setServerError(err);
    }
  }

  const busy = m.create.isPending || m.update.isPending;
  const stale = isApiError(serverError) && serverError.code === "stale_version";

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <fieldset className="grid gap-4 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-1 text-sm font-bold">Where it belongs</legend>
        {mode === "create" ? (
          <>
            <Field label="Exam" required error={errors.exam}>
              {(p) => <ExamSelect {...p} value={exam} onChange={setExam} />}
            </Field>
            <Field label="Stage" help="Leave blank for the exam's first stage.">
              {(p) => (
                <select {...p} value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
                  <option value="">{stages[0]?.name ?? "Default"}</option>
                  {stages.slice(1).map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        ) : null}
        <Field label="Subject" required error={errors.subject}>
          {(p) => (
            <select {...p} value={subject} onChange={(e) => { setSubject(e.target.value); setTopic(""); setSubtopic(""); }} className={inputClass} disabled={syllabus.isPending && !!exam}>
              <option value="">Choose…</option>
              {subjects.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Topic" help="A question cannot be published without a topic.">
          {(p) => (
            <select {...p} value={topic} onChange={(e) => { setTopic(e.target.value); setSubtopic(""); }} className={inputClass} disabled={!subject}>
              <option value="">{subject ? "Choose…" : "Pick a subject first"}</option>
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
        <Field label="Difficulty">
          {(p) => (
            <select {...p} value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} className={inputClass}>
              {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                <option key={d} value={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Kind of question">
          {(p) => (
            <select {...p} value={qtype} onChange={(e) => setQtype(e.target.value as QuestionType)} className={inputClass}>
              {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Answers">
          {(p) => (
            <select {...p} value={pattern} onChange={(e) => { setPattern(e.target.value as PatternKind); setCorrect(new Set()); }} className={inputClass}>
              <option value="single_correct_mcq">One correct option</option>
              <option value="multi_correct_mcq">More than one correct option</option>
            </select>
          )}
        </Field>
      </fieldset>

      {errors.lang && <p role="alert" className="text-sm font-semibold text-error-text">{errors.lang}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {LANGS.map((l) => (
          <fieldset key={l} lang={l} className="space-y-3 rounded-xl border border-line bg-white p-4">
            <legend className="px-1 text-sm font-bold">{LANG_LABEL[l]}</legend>
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" checked={tr[l].on} onChange={(e) => setTr((t) => ({ ...t, [l]: { ...t[l], on: e.target.checked } }))} className="h-4 w-4 accent-primary" />
              Include {LANG_LABEL[l]}
            </label>
            {tr[l].on && (
              <>
                <Field label={`Question (${LANG_LABEL[l]})`} required error={errors[`${l}-stem`]}>
                  {(p) => <textarea {...p} rows={4} value={tr[l].stem} onChange={(e) => setTr((t) => ({ ...t, [l]: { ...t[l], stem: e.target.value } }))} className={`${inputClass} py-2`} />}
                </Field>
                {keys.map((k) => (
                  <Field key={k} label={`Option ${k}`} required error={errors[`${l}-${k}`]}>
                    {(p) => <input {...p} value={tr[l].options[k] ?? ""} onChange={(e) => setOption(l, k, e.target.value)} className={inputClass} />}
                  </Field>
                ))}
                <Field label={`Explanation (${LANG_LABEL[l]})`} help="Shown to students after they answer.">
                  {(p) => <textarea {...p} rows={3} value={tr[l].explanation} onChange={(e) => setTr((t) => ({ ...t, [l]: { ...t[l], explanation: e.target.value } }))} className={`${inputClass} py-2`} />}
                </Field>
              </>
            )}
          </fieldset>
        ))}
      </div>

      <fieldset className="rounded-xl border border-line bg-white p-4" aria-describedby={errors.correct ? "correct-err" : undefined}>
        <legend className="px-1 text-sm font-bold">Correct answer{pattern === "multi_correct_mcq" ? "s" : ""}</legend>
        <div className="flex flex-wrap items-center gap-2">
          {keys.map((k) => (
            <label key={k} className={`flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold ${correct.has(k) ? "border-success-fill bg-success-fill text-white" : "border-line bg-white hover:border-primary"}`}>
              <input type={pattern === "single_correct_mcq" ? "radio" : "checkbox"} name="correct" checked={correct.has(k)} onChange={() => toggleCorrect(k)} className="sr-only" aria-invalid={errors.correct ? true : undefined} />
              {k}
            </label>
          ))}
          <Button variant="secondary" onClick={addOption} disabled={keys.length >= OPTION_KEYS.length} icon={<Plus className="h-4 w-4" aria-hidden />}>
            Add option
          </Button>
          <Button variant="secondary" onClick={removeOption} disabled={keys.length <= 2} icon={<Minus className="h-4 w-4" aria-hidden />}>
            Remove last option
          </Button>
        </div>
        {errors.correct && (
          <p id="correct-err" role="alert" className="mt-2 text-sm font-semibold text-error-text">
            {errors.correct}
          </p>
        )}
      </fieldset>

      {serverError ? (
        <div>
          <ErrorState error={serverError} />
          {stale && <p className="mt-2 text-sm">Someone changed this question after you opened it. Reload the page to see their version, then make your changes again.</p>}
        </div>
      ) : null}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {mode === "create" ? "Save as draft" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
