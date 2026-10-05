"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { toast } from "react-toastify";
import Button from "@/components/kit/Button";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { SLUG, SLUG_HELP, type TaxSubject, type TaxTopic } from "@/lib/api/catalogAdmin";
import { useCatalogMutations, usePrerequisites, useTaxonomy } from "@/lib/hooks/useCatalogAdmin";

type Dlg =
  | { kind: "subject" }
  | { kind: "topic"; subject: TaxSubject }
  | { kind: "subtopic"; topic: TaxTopic }
  | { kind: "rename"; node: "subjects" | "topics" | "subtopics"; id: string; name: string }
  | { kind: "prereq"; topic: TaxTopic; subject: string };

const iconBtn = "inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-bg-tint hover:text-ink";

/** The shared tree of subjects, topics and subtopics that every exam's syllabus picks from. Codes are fixed; names can change. */
export default function TaxonomyTab() {
  const q = useTaxonomy();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">Subjects and topics are shared by all exams. An exam chooses which topics belong to each stage on the Syllabus tab. Nothing here can be deleted, so check the code before you add one.</p>
      <Button onClick={() => setDlg({ kind: "subject" })} icon={<Plus className="h-4 w-4" aria-hidden />}>New subject</Button>
      {q.isPending ? <Skeleton className="h-48" /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">No subjects yet.</p> : (
        <ul className="space-y-3">
          {q.data.map((s) => (
            <li key={s.id} className="rounded-2xl border border-line bg-white p-3">
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => toggle(s.id)} aria-expanded={!!open[s.id]} className="inline-flex min-h-[44px] items-center gap-1 font-bold">
                  {open[s.id] ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                  {s.name}
                  <span className="sr-only"> topics</span>
                </button>
                <span className="font-mono text-xs text-ink-muted">{s.slug}</span>
                <span className="text-xs text-ink-muted">{s.topics.length} {s.topics.length === 1 ? "topic" : "topics"}</span>
                <button type="button" className={iconBtn} aria-label={`Rename subject ${s.name}`} onClick={() => setDlg({ kind: "rename", node: "subjects", id: s.id, name: s.name })}><Pencil className="h-4 w-4" aria-hidden /></button>
                <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setDlg({ kind: "topic", subject: s })}>Add a topic<span className="sr-only"> to {s.name}</span></Button>
              </div>
              {open[s.id] && (
                <ul className="mt-2 space-y-2 border-l-2 border-border-tint pl-4">
                  {s.topics.length === 0 && <li className="text-sm text-ink-muted">No topics yet.</li>}
                  {s.topics.map((t) => (
                    <li key={t.id} className="rounded-xl bg-bg-tint p-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-semibold">{t.name}</span>
                        <span className="font-mono text-xs text-ink-muted">{t.slug}</span>
                        <button type="button" className={iconBtn} aria-label={`Rename topic ${t.name}`} onClick={() => setDlg({ kind: "rename", node: "topics", id: t.id, name: t.name })}><Pencil className="h-4 w-4" aria-hidden /></button>
                        <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setDlg({ kind: "prereq", topic: t, subject: s.name })}>Prerequisites<span className="sr-only"> of {t.name}</span></Button>
                        <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setDlg({ kind: "subtopic", topic: t })}>Add a subtopic<span className="sr-only"> to {t.name}</span></Button>
                      </div>
                      {t.subtopics.length > 0 && (
                        <ul className="mt-1 flex flex-wrap gap-2">
                          {t.subtopics.map((st) => (
                            <li key={st.id} className="inline-flex items-center rounded-full bg-white pl-3 text-sm">
                              {st.name}
                              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-bg-tint" aria-label={`Rename subtopic ${st.name}`} onClick={() => setDlg({ kind: "rename", node: "subtopics", id: st.id, name: st.name })}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {dlg?.kind === "subject" && <NodeDialog title="New subject" onClose={() => setDlg(null)} />}
      {dlg?.kind === "topic" && <NodeDialog title={`New topic in ${dlg.subject.name}`} subject={dlg.subject.slug} onClose={() => setDlg(null)} />}
      {dlg?.kind === "subtopic" && <NodeDialog title={`New subtopic in ${dlg.topic.name}`} topicId={dlg.topic.id} onClose={() => setDlg(null)} />}
      {dlg?.kind === "rename" && <RenameDialog node={dlg.node} id={dlg.id} name={dlg.name} onClose={() => setDlg(null)} />}
      {dlg?.kind === "prereq" && <PrereqDialog topic={dlg.topic} subject={dlg.subject} subjects={q.data ?? []} onClose={() => setDlg(null)} />}
    </div>
  );
}

function NodeDialog({ title, subject, topicId, onClose }: { title: string; subject?: string; topicId?: string; onClose: () => void }) {
  const { createSubject, createTopic, createSubtopic } = useCatalogMutations();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mut = topicId ? createSubtopic : subject ? createTopic : createSubject;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!SLUG.test(slug)) err.slug = SLUG_HELP;
    if (!name.trim()) err.name = "Enter a name.";
    setErrors(err);
    if (Object.keys(err).length) return;
    const body = { slug, name: name.trim(), description: description.trim() || null, localized_names: {} };
    try {
      if (topicId) await createSubtopic.mutateAsync({ topicId, body });
      else if (subject) await createTopic.mutateAsync({ subject, body });
      else await createSubject.mutateAsync(body);
      toast.success("Added.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open title={title} onClose={onClose} busy={mut.isPending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Short code" required error={errors.slug} help={`Cannot be changed later. ${SLUG_HELP}`}>{(p) => <input {...p} value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={64} className={`${inputClass} font-mono`} />}</Field>
        <Field label="Name" required error={errors.name}>{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />}</Field>
        <Field label="Description">{(p) => <textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputClass} py-2`} />}</Field>
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button type="submit" loading={mut.isPending}>Add</Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameDialog({ node, id, name: current, onClose }: { node: "subjects" | "topics" | "subtopics"; id: string; name: string; onClose: () => void }) {
  const { renameNode } = useCatalogMutations();
  const [name, setName] = useState(current);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Enter a name.");
    setErr(null);
    try {
      await renameNode.mutateAsync({ kind: node, id, name: name.trim() });
      toast.success("Renamed.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open title="Rename" onClose={onClose} busy={renameNode.isPending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm text-ink-muted">Everywhere it is shown, students and staff will see the new name. The short code stays the same.</p>
        <Field label="Name" required error={err}>{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />}</Field>
        {renameNode.error ? <ErrorState compact error={renameNode.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={renameNode.isPending}>Cancel</Button>
          <Button type="submit" loading={renameNode.isPending}>Save name</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** What a student should learn first. The server refuses a loop (A needs B needs A) and more than ten. */
function PrereqDialog({ topic, subject, subjects, onClose }: { topic: TaxTopic; subject: string; subjects: TaxSubject[]; onClose: () => void }) {
  const current = usePrerequisites(topic.id);
  const { setPrerequisites } = useCatalogMutations();
  const [picked, setPicked] = useState<string[] | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    if (current.data && picked === null) setPicked(current.data.prerequisites.map((p) => p.topic_id));
  }, [current.data, picked]);
  const all = useMemo(() => subjects.flatMap((s) => s.topics.filter((t) => t.id !== topic.id).map((t) => ({ id: t.id, label: `${s.name}: ${t.name}` }))), [subjects, topic.id]);
  const shown = all.filter((t) => !text.trim() || t.label.toLowerCase().includes(text.trim().toLowerCase()));
  const sel = picked ?? [];
  async function save() {
    try {
      await setPrerequisites.mutateAsync({ topicId: topic.id, ids: sel });
      toast.success("Prerequisites saved.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open title={`Prerequisites of ${topic.name}`} onClose={onClose} busy={setPrerequisites.isPending} wide>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">Topics in {subject} and others a student should finish before {topic.name}. Choose up to 10. Saving replaces the list.</p>
        {current.isPending ? <Skeleton className="h-24" /> : current.isError ? <ErrorState compact error={current.error} /> : (
          <>
            {current.data.unlocks.length > 0 && <p className="rounded-lg bg-bg-tint px-3 py-2 text-sm">Finishing this topic unlocks: {current.data.unlocks.map((u) => u.topic_name).join(", ")}.</p>}
            <Field label="Find a topic">{(p) => <input {...p} type="search" value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />}</Field>
            <div role="group" aria-label="Choose prerequisite topics" tabIndex={0} className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {shown.length === 0 ? <p className="p-3 text-sm text-ink-muted">No topic matches.</p> : shown.map((t) => (
                <label key={t.id} className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-sm hover:bg-bg-tint">
                  <input type="checkbox" checked={sel.includes(t.id)} onChange={(e) => setPicked(e.target.checked ? [...sel, t.id] : sel.filter((x) => x !== t.id))} className="h-4 w-4 accent-primary" />
                  {t.label}
                </label>
              ))}
            </div>
            <p role="status" className="text-sm">{sel.length} chosen{sel.length > 10 ? ". The most allowed is 10." : "."}</p>
          </>
        )}
        {setPrerequisites.error ? <ErrorState compact error={setPrerequisites.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={setPrerequisites.isPending}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!current.data || sel.length > 10} loading={setPrerequisites.isPending}>Save prerequisites</Button>
        </div>
      </div>
    </Dialog>
  );
}
