"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect, { useExamNames } from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { questionsApi, type Alias, type Pool } from "@/lib/api/questions";
import { useCategories } from "@/lib/hooks/useExamEvents";
import { useAliases, usePools } from "@/lib/hooks/useQuestions";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Which exams share previous-year questions, and which exam names on a source paper map to which exam. */
export default function PoolsScreen() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div>
        <h1 className="text-2xl font-extrabold">Pools and aliases</h1>
        <p className="mt-1 text-sm text-ink-muted">Pools let exams that share general-studies questions practise from the same papers. Aliases link the exam names printed on source papers to our exams.</p>
      </div>
      <Pools />
      <Aliases />
    </div>
  );
}

function useRefreshing(keys: string[]) {
  const qc = useQueryClient();
  return () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

function Pools() {
  const q = usePools();
  const names = useExamNames();
  const refresh = useRefreshing(["pools"]);
  const [create, setCreate] = useState(false);
  const [editing, setEditing] = useState<{ pool: Pool; what: "exams" | "subjects" } | null>(null);

  const toggle = useMutation({ mutationFn: (p: Pool) => questionsApi.updatePool(p.slug, { is_active: !p.is_active }), onSuccess: refresh, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not change the pool.") });

  return (
    <section aria-labelledby="pools-h" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="pools-h" className="text-xl font-bold">
          Shared PYQ pools
        </h2>
        <Button onClick={() => setCreate(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
          New pool
        </Button>
      </div>
      {q.isPending ? (
        <Skeleton className="h-32" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">No pools yet.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {q.data.map((p) => (
            <li key={p.slug} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{p.name}</h3>
                  <p className="font-mono text-xs text-ink-muted">{p.slug}</p>
                </div>
                <Badge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              {p.description && <p className="mt-2 text-sm text-ink-muted">{p.description}</p>}
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-ink-muted">Exams</p>
              <p className="text-sm">{p.exams.length ? p.exams.map((x) => names.get(x.slug) ?? x.name).join(", ") : "None"}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Subjects</p>
              <p className="text-sm">{p.subjects.length ? p.subjects.map((x) => x.name).join(", ") : "None"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" className="!min-h-[36px]" onClick={() => setEditing({ pool: p, what: "exams" })}>
                  Edit exams<span className="sr-only"> of {p.name}</span>
                </Button>
                <Button variant="secondary" className="!min-h-[36px]" onClick={() => setEditing({ pool: p, what: "subjects" })}>
                  Edit subjects<span className="sr-only"> of {p.name}</span>
                </Button>
                <Button variant="ghost" className="!min-h-[36px]" onClick={() => toggle.mutate(p)} loading={toggle.isPending && toggle.variables?.slug === p.slug}>
                  {p.is_active ? "Deactivate" : "Activate"}
                  <span className="sr-only"> {p.name}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <CreatePool open={create} onClose={() => setCreate(false)} onDone={refresh} />
      <EditPool editing={editing} onClose={() => setEditing(null)} onDone={refresh} />
    </section>
  );
}

function CreatePool({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ slug?: string; name?: string }>({});
  const m = useMutation({ mutationFn: () => questionsApi.createPool({ slug, name: name.trim(), description: description.trim() || null, is_active: true }), onSuccess: onDone });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er = { slug: SLUG.test(slug) ? undefined : "Use lowercase letters, digits and single dashes, for example general-studies.", name: name.trim() ? undefined : "Enter a name." };
    setErrors(er);
    if (er.slug || er.name) return;
    try {
      await m.mutateAsync();
      toast.success("Pool created.");
      setSlug("");
      setName("");
      setDescription("");
      onClose();
    } catch {}
  }
  return (
    <Dialog open={open} title="New pool" onClose={onClose} busy={m.isPending}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" required error={errors.name}>
          {(p) => <input {...p} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Short code" required error={errors.slug} help="Used in addresses. It cannot be changed later.">
          {(p) => <input {...p} value={slug} maxLength={64} onChange={(e) => setSlug(e.target.value.toLowerCase())} className={`${inputClass} font-mono`} />}
        </Field>
        <Field label="Description">{(p) => <textarea {...p} rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} py-2`} />}</Field>
        {m.error ? <ErrorState compact error={m.error} /> : null}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={m.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={m.isPending}>
            Create pool
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditPool({ editing, onClose, onDone }: { editing: { pool: Pool; what: "exams" | "subjects" } | null; onClose: () => void; onDone: () => void }) {
  const categories = useCategories();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [subjects, setSubjects] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time a different pool or field is opened.
  const id = editing ? `${editing.pool.slug}:${editing.what}` : "";
  if (id !== key) {
    setKey(id);
    if (editing) {
      setPicked(new Set(editing.pool.exams.map((x) => x.slug)));
      setSubjects(editing.pool.subjects.map((x) => x.slug).join(", "));
      setError(null);
    }
  }

  const m = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Nothing to save.");
      if (editing.what === "exams") return questionsApi.setPoolExams(editing.pool.slug, [...picked]);
      const list = [...new Set(subjects.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];
      const bad = list.find((s) => !SLUG.test(s));
      if (bad) throw new Error(`"${bad}" is not a valid subject code. Use lowercase letters, digits and dashes.`);
      return questionsApi.setPoolSubjects(editing.pool.slug, list);
    },
    onSuccess: onDone,
  });

  async function save() {
    setError(null);
    try {
      await m.mutateAsync();
      toast.success("Saved.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <Dialog open={!!editing} title={editing ? `${editing.what === "exams" ? "Exams" : "Subjects"} in ${editing.pool.name}` : ""} onClose={onClose} busy={m.isPending} wide>
      {editing?.what === "exams" ? (
        <fieldset className="max-h-80 space-y-3 overflow-y-auto pr-2">
          <legend className="sr-only">Exams in this pool</legend>
          {(categories.data ?? []).map((c) => (
            <div key={c.slug}>
              <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{c.name}</p>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {c.exams.map((x) => (
                  <label key={x.slug} className="flex min-h-[44px] items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={picked.has(x.slug)}
                      onChange={() =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (n.has(x.slug)) n.delete(x.slug);
                          else n.add(x.slug);
                          return n;
                        })
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    {x.short_name || x.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      ) : (
        <Field label="Subject codes" help="Separate with commas, for example general-knowledge, polity. Questions in these subjects are shared across the pool's exams.">
          {(p) => <textarea {...p} rows={4} value={subjects} onChange={(e) => setSubjects(e.target.value)} className={`${inputClass} py-2 font-mono`} />}
        </Field>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-error-text">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={m.isPending}>
          Cancel
        </Button>
        <Button onClick={save} loading={m.isPending}>
          Save
        </Button>
      </div>
    </Dialog>
  );
}

function Aliases() {
  const q = useAliases();
  const names = useExamNames();
  const refresh = useRefreshing(["aliases"]);
  const [alias, setAlias] = useState("");
  const [exam, setExam] = useState("");
  const [stage, setStage] = useState("");
  const [errors, setErrors] = useState<{ alias?: string; exam?: string }>({});
  const [removing, setRemoving] = useState<Alias | null>(null);

  const add = useMutation({ mutationFn: () => questionsApi.createAlias({ alias: alias.trim(), exam_slug: exam, stage_slug: stage.trim() || null }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: string) => questionsApi.deleteAlias(id), onSuccess: refresh });

  const columns: Column<Alias>[] = useMemo(
    () => [
      { key: "alias", header: "Name on the source paper", cell: (a) => <span className="font-semibold">{a.alias}</span> },
      { key: "exam", header: "Our exam", cell: (a) => names.get(a.exam_slug) ?? a.exam_slug },
      { key: "stage", header: "Stage", cell: (a) => a.stage_slug ?? <span className="text-ink-muted">Any</span> },
      {
        key: "x",
        header: "Action",
        cell: (a) => (
          <Button variant="ghost" className="!min-h-[36px] text-error-text" onClick={() => setRemoving(a)} icon={<Trash2 className="h-4 w-4" aria-hidden />}>
            Remove<span className="sr-only"> alias {a.alias}</span>
          </Button>
        ),
      },
    ],
    [names]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er = { alias: alias.trim() ? undefined : "Enter the name as printed on the paper.", exam: exam ? undefined : "Choose the exam." };
    setErrors(er);
    if (er.alias || er.exam) return;
    try {
      await add.mutateAsync();
      toast.success("Alias added.");
      setAlias("");
      setStage("");
    } catch {}
  }

  return (
    <section aria-labelledby="alias-h" className="space-y-4">
      <h2 id="alias-h" className="text-xl font-bold">
        Exam name aliases
      </h2>
      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" noValidate>
        <Field label="Name on the paper" required error={errors.alias}>
          {(p) => <input {...p} value={alias} maxLength={80} onChange={(e) => setAlias(e.target.value)} className={inputClass} placeholder="For example SSC CGL Tier-I" />}
        </Field>
        <Field label="Our exam" required error={errors.exam}>
          {(p) => <ExamSelect {...p} value={exam} onChange={setExam} />}
        </Field>
        <Field label="Stage code" help="Leave blank if it applies to every stage.">
          {(p) => <input {...p} value={stage} maxLength={64} onChange={(e) => setStage(e.target.value.toLowerCase())} className={inputClass} placeholder="tier-1" />}
        </Field>
        <div className="flex items-end">
          <Button type="submit" loading={add.isPending}>
            Add alias
          </Button>
        </div>
      </form>
      {add.error ? <ErrorState compact error={add.error} /> : null}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="Exam name aliases" columns={columns} rows={q.data} rowKey={(a) => a.id} loading={q.isPending} empty="No aliases yet." />}
      <ConfirmDialog
        open={!!removing}
        title="Remove this alias?"
        confirmLabel="Remove"
        danger
        busy={del.isPending}
        error={del.error}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await del.mutateAsync(removing.id);
            setRemoving(null);
          } catch {}
        }}
        onCancel={() => {
          del.reset();
          setRemoving(null);
        }}
      >
        <p>
          <strong>{removing?.alias}</strong> will no longer be matched to {removing ? (names.get(removing.exam_slug) ?? removing.exam_slug) : ""} when papers are imported.
        </p>
      </ConfirmDialog>
    </section>
  );
}
