"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useExamStage } from "@/components/catalog/SyllabusTab";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { DIFFICULTIES, type Blueprint, type BlueprintSection } from "@/lib/api/catalogAdmin";
import { useBlueprints, useCatalogMutations, useTaxonomy } from "@/lib/hooks/useCatalogAdmin";

const mins = (s: number) => `${Math.round((s / 60) * 10) / 10} min`;
const DEC = /^\d{1,3}(\.\d{1,3})?$/;

/** The shape of a full practice test for a stage: its sections, marks and timing. A new version never changes an old one. */
export default function BlueprintsTab() {
  const { exam, stage, picker } = useExamStage();
  const q = useBlueprints(exam, stage);
  const { activateBlueprint } = useCatalogMutations();
  const [creating, setCreating] = useState(false);
  const [activate, setActivate] = useState<Blueprint | null>(null);

  const columns: Column<Blueprint>[] = [
    { key: "v", header: "Version", cell: (b) => <span className="font-semibold">{b.version}</span> },
    { key: "n", header: "Name", cell: (b) => b.name },
    { key: "s", header: "State", cell: (b) => <Badge tone={b.is_active ? "success" : "neutral"}>{b.is_active ? "In use" : "Not in use"}</Badge> },
    { key: "d", header: "Time", cell: (b) => mins(b.duration_seconds) },
    { key: "q", header: "Questions", align: "right", cell: (b) => b.total_questions },
    { key: "m", header: "Marks", align: "right", cell: (b) => Number(b.total_marks) },
    { key: "a", header: "Action", cell: (b) => (b.is_active ? null : <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setActivate(b)}>Use this version<span className="sr-only"> {b.version}</span></Button>) },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">Full-length practice tests for a stage are built from the version in use. Make a new version to change anything, then choose when to start using it.</p>
      {picker}
      {stage && <Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>New version</Button>}
      {!stage ? null : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="Blueprint versions" columns={columns} rows={q.data} rowKey={(b) => String(b.version)} loading={q.isPending} empty={<><p className="font-semibold text-ink">No blueprint for this stage yet</p><p className="mt-1">Without one, students cannot start a full-length AI practice test for it.</p></>} />}
      {creating && exam && stage && <BlueprintDialog exam={exam} stage={stage} onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!activate} title="Use this version?" confirmLabel="Use this version" busy={activateBlueprint.isPending} error={activateBlueprint.error}
        onCancel={() => { activateBlueprint.reset(); setActivate(null); }}
        onConfirm={async () => {
          if (!activate || !exam || !stage) return;
          try { await activateBlueprint.mutateAsync({ exam, stage, version: activate.version }); toast.success("Now in use."); setActivate(null); } catch {}
        }}>
        {activate && <p>Version {activate.version}, {activate.name}, becomes the blueprint for new practice tests of this stage. Tests already made keep the version they used.</p>}
      </ConfirmDialog>
    </div>
  );
}

type Sec = { name: string; subject: string; count: string; marks: string; neg: string; minutes: string; easy: string; medium: string; hard: string };
const blank = (): Sec => ({ name: "", subject: "", count: "", marks: "", neg: "", minutes: "", easy: "", medium: "", hard: "" });

function BlueprintDialog({ exam, stage, onClose }: { exam: string; stage: string; onClose: () => void }) {
  const { createBlueprint } = useCatalogMutations();
  const taxonomy = useTaxonomy();
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("");
  const [correct, setCorrect] = useState("1");
  const [negative, setNegative] = useState("0.25");
  const [secs, setSecs] = useState<Sec[]>([blank()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const upd = (i: number, patch: Partial<Sec>) => setSecs((c) => c.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = "Enter a name.";
    const m = Number(minutes);
    if (!/^\d+$/.test(minutes) || m < 1 || m > 360) err.minutes = "Enter whole minutes, from 1 to 360.";
    if (!DEC.test(correct) || Number(correct) <= 0 || Number(correct) > 100) err.correct = "Enter marks above 0, up to 100.";
    if (!DEC.test(negative) || Number(negative) > 100) err.negative = "Enter marks lost from 0 to 100.";
    const sections: BlueprintSection[] = [];
    secs.forEach((s, i) => {
      const k = (f: string) => `s${i}-${f}`;
      if (!s.name.trim()) err[k("name")] = "Enter a name.";
      if (!/^\d+$/.test(s.count) || Number(s.count) < 1 || Number(s.count) > 1000) err[k("count")] = "Enter 1 to 1000.";
      if (!DEC.test(s.marks) || Number(s.marks) <= 0) err[k("marks")] = "Enter marks above 0.";
      if (!DEC.test(s.neg)) err[k("neg")] = "Enter marks lost, 0 or more.";
      if (s.minutes && (!/^\d+$/.test(s.minutes) || Number(s.minutes) < 1)) err[k("minutes")] = "Enter whole minutes, or leave empty.";
      const mixGiven = [s.easy, s.medium, s.hard].some((x) => x.trim() !== "");
      const mix = { easy: Number(s.easy || 0), medium: Number(s.medium || 0), hard: Number(s.hard || 0) };
      if (mixGiven && ![s.easy, s.medium, s.hard].every((x) => x === "" || /^\d+$/.test(x))) err[k("mix")] = "Use whole percentages.";
      else if (mixGiven && mix.easy + mix.medium + mix.hard !== 100) err[k("mix")] = `The difficulty shares add up to ${mix.easy + mix.medium + mix.hard}. They must add up to 100.`;
      sections.push({ name: s.name.trim(), subject_slug: s.subject || null, question_count: Number(s.count), marks_per_question: s.marks, negative_marks: s.neg, duration_seconds: s.minutes ? Number(s.minutes) * 60 : null, difficulty_mix: mixGiven ? mix : {}, topic_weights: {} } as BlueprintSection);
    });
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      const b = await createBlueprint.mutateAsync({ exam, stage, body: { name: name.trim(), duration_seconds: m * 60, default_correct_marks: correct, default_negative_marks: negative, sections } });
      toast.success(`Version ${b.version} saved. It is not in use until you choose it.`);
      onClose();
    } catch {}
  }

  const totalQ = secs.reduce((a, s) => a + (Number(s.count) || 0), 0);
  const totalM = secs.reduce((a, s) => a + (Number(s.count) || 0) * (Number(s.marks) || 0), 0);
  return (
    <Dialog open title="New blueprint version" onClose={onClose} busy={createBlueprint.isPending} wide>
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name}>{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />}</Field>
          <Field label="Total time (minutes)" required error={errors.minutes}>{(p) => <input {...p} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputClass} />}</Field>
          <Field label="Marks for a right answer" required error={errors.correct} help="The default; each section can set its own.">{(p) => <input {...p} inputMode="decimal" value={correct} onChange={(e) => setCorrect(e.target.value)} className={inputClass} />}</Field>
          <Field label="Marks lost for a wrong answer" required error={errors.negative}>{(p) => <input {...p} inputMode="decimal" value={negative} onChange={(e) => setNegative(e.target.value)} className={inputClass} />}</Field>
        </div>
        <fieldset className="space-y-3">
          <legend className="text-base font-bold">Sections</legend>
          {secs.map((s, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Section {i + 1}</h3>
                {secs.length > 1 && <button type="button" onClick={() => setSecs((c) => c.filter((_, j) => j !== i))} aria-label={`Remove section ${i + 1}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-error-text hover:bg-error-tint"><Trash2 className="h-4 w-4" aria-hidden /></button>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`Name, section ${i + 1}`} required error={errors[`s${i}-name`]}>{(p) => <input {...p} value={s.name} onChange={(e) => upd(i, { name: e.target.value })} maxLength={120} className={inputClass} />}</Field>
                <Field label={`Subject, section ${i + 1}`} help="Optional. Leave on any subject to mix them.">
                  {(p) => (
                    <select {...p} value={s.subject} onChange={(e) => upd(i, { subject: e.target.value })} className={inputClass}>
                      <option value="">Any subject</option>
                      {(taxonomy.data ?? []).map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                    </select>
                  )}
                </Field>
                <Field label={`Questions, section ${i + 1}`} required error={errors[`s${i}-count`]}>{(p) => <input {...p} inputMode="numeric" value={s.count} onChange={(e) => upd(i, { count: e.target.value })} className={inputClass} />}</Field>
                <Field label={`Minutes, section ${i + 1}`} error={errors[`s${i}-minutes`]} help="Optional.">{(p) => <input {...p} inputMode="numeric" value={s.minutes} onChange={(e) => upd(i, { minutes: e.target.value })} className={inputClass} />}</Field>
                <Field label={`Marks per question, section ${i + 1}`} required error={errors[`s${i}-marks`]}>{(p) => <input {...p} inputMode="decimal" value={s.marks} onChange={(e) => upd(i, { marks: e.target.value })} className={inputClass} />}</Field>
                <Field label={`Marks lost per wrong answer, section ${i + 1}`} required error={errors[`s${i}-neg`]}>{(p) => <input {...p} inputMode="decimal" value={s.neg} onChange={(e) => upd(i, { neg: e.target.value })} className={inputClass} />}</Field>
              </div>
              <fieldset>
                <legend className="text-sm font-semibold">Mix of difficulty (%), section {i + 1}</legend>
                <p className="text-xs text-ink-muted">Optional. Fill all that apply; they must add up to 100.</p>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {DIFFICULTIES.map((d) => (
                    <Field key={d} label={`${d[0].toUpperCase()}${d.slice(1)}, section ${i + 1}`}>{(p) => <input {...p} inputMode="numeric" value={s[d]} onChange={(e) => upd(i, { [d]: e.target.value } as Partial<Sec>)} className={inputClass} />}</Field>
                  ))}
                </div>
                {errors[`s${i}-mix`] && <p role="alert" className="mt-1 text-sm font-semibold text-error-text">{errors[`s${i}-mix`]}</p>}
              </fieldset>
            </div>
          ))}
          <Button type="button" variant="secondary" disabled={secs.length >= 20} onClick={() => setSecs((c) => [...c, blank()])} icon={<Plus className="h-4 w-4" aria-hidden />}>Add a section</Button>
        </fieldset>
        <p role="status" className="text-sm">In all: {totalQ} questions, {Math.round(totalM * 1000) / 1000} marks.</p>
        {createBlueprint.error ? <ErrorState compact error={createBlueprint.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={createBlueprint.isPending}>Cancel</Button>
          <Button type="submit" loading={createBlueprint.isPending}>Save version</Button>
        </div>
      </form>
    </Dialog>
  );
}
