"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import type { TaxSubject } from "@/lib/api/catalogAdmin";
import { useCatalogMutations, useTaxonomy } from "@/lib/hooks/useCatalogAdmin";
import { useCategories, useExam } from "@/lib/hooks/useExamEvents";
import { useSyllabus } from "@/lib/hooks/useQuestions";

/** An exam and one of its stages, chosen together. The stage list follows the exam. */
export function useExamStage() {
  const categories = useCategories();
  const [chosenExam, setExam] = useState("");
  const [chosenStage, setStage] = useState("");
  const exam = chosenExam || categories.data?.[0]?.exams[0]?.slug || null;
  const data = useExam(exam);
  const stages = data.data?.stages ?? [];
  const stage = stages.some((s) => s.slug === chosenStage) ? chosenStage : (stages[0]?.slug ?? null);
  const picker = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Exam">{(p) => <ExamSelect {...p} value={exam ?? ""} onChange={(v) => { setExam(v); setStage(""); }} />}</Field>
      <Field label="Stage" help={data.isSuccess && stages.length === 0 ? "This exam has no stages yet. Add one on the Exams tab." : undefined}>
        {(p) => (
          <select {...p} value={stage ?? ""} onChange={(e) => setStage(e.target.value)} className={inputClass} disabled={stages.length === 0}>
            {stages.map((s) => <option key={s.slug} value={s.slug}>{s.sequence}. {s.name}</option>)}
          </select>
        )}
      </Field>
    </div>
  );
  return { exam, stage, picker, loading: categories.isPending || data.isPending };
}

type Item = { id: string; name: string; subject: string; weight: string; display: string };

export default function SyllabusTab() {
  const { exam, stage, picker, loading } = useExamStage();
  const syllabus = useSyllabus(exam, stage);
  const taxonomy = useTaxonomy();
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">The topics of one stage of an exam, in the order students see them. Saving replaces the whole syllabus of the stage.</p>
      {picker}
      {loading || (!!stage && (syllabus.isPending || taxonomy.isPending)) ? <Skeleton className="h-48" /> : !stage ? null : syllabus.isError ? <ErrorState error={syllabus.error} onRetry={() => syllabus.refetch()} /> : taxonomy.isError ? <ErrorState error={taxonomy.error} onRetry={() => taxonomy.refetch()} /> : (
        <Editor key={`${exam}/${stage}/${syllabus.dataUpdatedAt}`} exam={exam!} stage={stage} syllabus={syllabus.data!} taxonomy={taxonomy.data!} />
      )}
    </div>
  );
}

function Editor({ exam, stage, syllabus, taxonomy }: { exam: string; stage: string; syllabus: NonNullable<ReturnType<typeof useSyllabus>["data"]>; taxonomy: TaxSubject[] }) {
  const { replaceSyllabus } = useCatalogMutations();
  const canon = useMemo(() => new Map(taxonomy.flatMap((s) => s.topics.map((t) => [t.id, { name: t.name, subject: s.name }] as const))), [taxonomy]);
  const initial = useMemo<Item[]>(
    () => syllabus.subjects.flatMap((s) => s.topics.map((t) => ({ id: t.id, name: canon.get(t.id)?.name ?? t.name, subject: s.name, weight: t.weightage == null ? "" : String(Number(t.weightage)), display: canon.get(t.id) && canon.get(t.id)!.name !== t.name ? t.name : "" }))),
    [syllabus, canon],
  );
  const [items, setItems] = useState<Item[]>(initial);
  const [confirm, setConfirm] = useState(false);
  const [shown, setShown] = useState(false);
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);

  const set = (id: string, patch: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const move = (i: number, d: -1 | 1) => setItems((cur) => { const n = [...cur]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  const given = items.filter((i) => i.weight.trim() !== "");
  const total = given.reduce((a, i) => a + (Number(i.weight) || 0), 0);
  const errors: Record<string, string> = {};
  for (const i of items) {
    const w = i.weight.trim();
    if (w !== "" && (!/^\d{1,3}(\.\d{1,2})?$/.test(w) || Number(w) > 100)) errors[i.id] = "Enter a percentage from 0 to 100 with at most two decimals.";
    else if (i.display.length > 120) errors[i.id] = "Use at most 120 characters.";
  }
  let overall: string | null = null;
  if (given.length > 0 && given.length !== items.length) overall = "Give a weightage for every topic, or for none.";
  else if (given.length > 0 && Math.abs(total - 100) > 0.05) overall = `Weightages add up to ${Math.round(total * 100) / 100}. They must add up to 100.`;
  const valid = Object.keys(errors).length === 0 && !overall;

  const initialIds = new Set(initial.map((i) => i.id));
  const nowIds = new Set(items.map((i) => i.id));
  const added = items.filter((i) => !initialIds.has(i.id)).length;
  const removed = initial.filter((i) => !nowIds.has(i.id)).length;
  const dirty = JSON.stringify(items) !== JSON.stringify(initial);

  const candidates = taxonomy.map((s) => ({ subject: s.name, topics: s.topics.filter((t) => !nowIds.has(t.id) && (!text.trim() || `${s.name} ${t.name}`.toLowerCase().includes(text.trim().toLowerCase()))) })).filter((g) => g.topics.length > 0);

  async function save() {
    try {
      await replaceSyllabus.mutateAsync({ exam, stage, topics: items.map((i) => ({ topic_id: i.id, weightage: i.weight.trim() === "" ? null : i.weight.trim(), display_name: i.display.trim() || null })) });
      toast.success("Syllabus saved.");
      setConfirm(false);
    } catch {}
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="syl-h" className="space-y-3">
        <h2 id="syl-h" className="text-lg font-bold">In this syllabus ({items.length})</h2>
        {items.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted">No topics yet. Add some below.</p> : (
          <ol className="space-y-2">
            {items.map((i, idx) => (
              <li key={i.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-white p-3">
                <div className="min-w-[10rem] flex-1">
                  <p className="font-semibold">{i.name}</p>
                  <p className="text-xs text-ink-muted">{i.subject}</p>
                </div>
                <Field label={`Weightage (%) for ${i.name}`} error={shown ? errors[i.id] : null} className="w-40">{(p) => <input {...p} inputMode="decimal" value={i.weight} onChange={(e) => set(i.id, { weight: e.target.value })} className={inputClass} />}</Field>
                <Field label={`Shown as, for ${i.name}`} className="min-w-[10rem] flex-1" help="Optional. Leave empty to use the topic name.">{(p) => <input {...p} value={i.display} onChange={(e) => set(i.id, { display: e.target.value })} maxLength={120} className={inputClass} />}</Field>
                <div className="flex items-center self-center">
                  <button type="button" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label={`Move ${i.name} up`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-bg-tint disabled:opacity-40"><ArrowUp className="h-4 w-4" aria-hidden /></button>
                  <button type="button" disabled={idx === items.length - 1} onClick={() => move(idx, 1)} aria-label={`Move ${i.name} down`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-bg-tint disabled:opacity-40"><ArrowDown className="h-4 w-4" aria-hidden /></button>
                  <button type="button" onClick={() => setItems((c) => c.filter((x) => x.id !== i.id))} aria-label={`Remove ${i.name} from the syllabus`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-error-text hover:bg-error-tint"><Trash2 className="h-4 w-4" aria-hidden /></button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p role="status" className="text-sm">{given.length > 0 ? `Weightages so far: ${Math.round(total * 100) / 100} of 100.` : "No weightages set. They are optional, but all or none."}</p>
        {shown && overall && <p role="alert" className="text-sm font-semibold text-error-text">{overall}</p>}
        {replaceSyllabus.error && !confirm ? <ErrorState compact error={replaceSyllabus.error} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!dirty} onClick={() => { setShown(true); if (valid) setConfirm(true); }}>Review and save</Button>
          <Button type="button" variant="ghost" disabled={!dirty} onClick={() => { setItems(initial); setShown(false); }}>Undo my changes</Button>
        </div>
      </section>

      <section aria-labelledby="add-h" className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <h2 id="add-h" className="text-lg font-bold">Add topics</h2>
        <Field label="Find a topic">{(p) => <input {...p} type="search" value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />}</Field>
        <div role="group" aria-label="Topics not in the syllabus" tabIndex={0} className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-line p-2">
          {candidates.length === 0 ? <p className="p-3 text-sm text-ink-muted">No other topic matches. Create topics on the Subjects and topics tab.</p> : candidates.map((g) => (
            <fieldset key={g.subject}>
              <legend className="px-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{g.subject}</legend>
              {g.topics.map((t) => (
                <label key={t.id} className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm hover:bg-bg-tint">
                  <input type="checkbox" checked={chosen.includes(t.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))} className="h-4 w-4 accent-primary" />
                  {t.name}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <Button type="button" variant="secondary" disabled={chosen.length === 0} icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => {
          setItems((cur) => [...cur, ...chosen.map((id) => ({ id, name: canon.get(id)?.name ?? "", subject: canon.get(id)?.subject ?? "", weight: "", display: "" }))]);
          setChosen([]);
        }}>
          Add {chosen.length || ""} chosen {chosen.length === 1 ? "topic" : "topics"}
        </Button>
      </section>

      <ConfirmDialog open={confirm} title="Save this syllabus?" confirmLabel="Save syllabus" busy={replaceSyllabus.isPending} error={replaceSyllabus.error} onCancel={() => { replaceSyllabus.reset(); setConfirm(false); }} onConfirm={save}>
        <p>It replaces the syllabus of this stage. Students and the study planner use it straight away.</p>
        <p className="rounded-lg bg-bg-tint px-3 py-2 text-ink">{items.length} topics in all. {added} added, {removed} removed.</p>
      </ConfirmDialog>
    </div>
  );
}
