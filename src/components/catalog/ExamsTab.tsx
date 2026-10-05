"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ExamCategory, Exam, ExamStage } from "@/lib/api/catalog";
import { SLUG, SLUG_HELP } from "@/lib/api/catalogAdmin";
import { useCatalogMutations } from "@/lib/hooks/useCatalogAdmin";
import { useCategories, useExam } from "@/lib/hooks/useExamEvents";

type Names = Record<string, string>;
/** Keeps every other language the server holds and sets or clears Hindi. */
const withHindi = (names: Names | undefined, hi: string): Names => {
  const out = { ...(names ?? {}) };
  if (hi.trim()) out.hi = hi.trim();
  else delete out.hi;
  return out;
};

/** Categories, exams and the stages of each exam. Slugs are fixed once created, and nothing can be deleted. */
export default function ExamsTab() {
  const categories = useCategories();
  const [dlg, setDlg] = useState<{ kind: "category"; category?: ExamCategory } | { kind: "exam"; exam?: Exam; category?: string } | null>(null);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setDlg({ kind: "exam" })} icon={<Plus className="h-4 w-4" aria-hidden />} disabled={!categories.data?.length}>
          New exam
        </Button>
        <Button variant="secondary" onClick={() => setDlg({ kind: "category" })}>
          New category
        </Button>
      </div>
      {categories.isPending ? <Skeleton className="h-48" /> : categories.isError ? <ErrorState error={categories.error} onRetry={() => categories.refetch()} /> : categories.data.length === 0 ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-muted">No categories yet. Create one, then add exams to it.</p> : (
        categories.data.map((c) => (
          <section key={c.slug} aria-label={`Category ${c.name}`} className="space-y-3 rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold">{c.name}</h2>
              <span className="font-mono text-xs text-ink-muted">{c.slug}</span>
              <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setDlg({ kind: "category", category: c })}>
                Edit<span className="sr-only"> category {c.name}</span>
              </Button>
              <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setDlg({ kind: "exam", category: c.slug })}>
                Add an exam<span className="sr-only"> to {c.name}</span>
              </Button>
            </div>
            {c.exams.length === 0 ? <p className="text-sm text-ink-muted">No exams in this category.</p> : <ul className="space-y-2">{c.exams.map((x) => <ExamRow key={x.slug} slug={x.slug} onEdit={(exam) => setDlg({ kind: "exam", exam })} />)}</ul>}
          </section>
        ))
      )}
      {dlg?.kind === "category" && <CategoryDialog category={dlg.category} onClose={() => setDlg(null)} />}
      {dlg?.kind === "exam" && <ExamDialog exam={dlg.exam} defaultCategory={dlg.category} categories={categories.data ?? []} onClose={() => setDlg(null)} />}
    </div>
  );
}

function ExamRow({ slug, onEdit }: { slug: string; onEdit: (e: Exam) => void }) {
  const [open, setOpen] = useState(false);
  const exam = useExam(slug);
  const [stage, setStage] = useState<{ stage?: ExamStage } | null>(null);
  const e = exam.data;
  return (
    <li className="rounded-xl bg-bg-tint p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex min-h-[44px] items-center gap-1 text-left font-semibold">
          {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          {e?.name ?? slug}
          <span className="sr-only"> stages</span>
        </button>
        <span className="font-mono text-xs text-ink-muted">{slug}</span>
        {e?.short_name && <Badge tone="neutral">{e.short_name}</Badge>}
        {e?.stages && <span className="text-xs text-ink-muted">{e.stages.length} {e.stages.length === 1 ? "stage" : "stages"}</span>}
        <Button variant="ghost" className="!min-h-[36px] !px-3" disabled={!e} onClick={() => e && onEdit(e)}>
          Edit<span className="sr-only"> exam {e?.name ?? slug}</span>
        </Button>
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-line pt-2">
          {exam.isPending ? <Skeleton className="h-12" /> : exam.isError ? <ErrorState compact error={exam.error} /> : (
            <>
              {e!.stages.length === 0 ? <p className="text-sm text-ink-muted">No stages yet. Syllabus, blueprints and papers belong to a stage, so add one.</p> : (
                <ul className="divide-y divide-line rounded-lg bg-white">
                  {e!.stages.map((s) => (
                    <li key={s.slug} className="flex flex-wrap items-center gap-2 px-3 py-1">
                      <span className="min-h-[44px] flex-1 content-center text-sm">
                        <span className="font-semibold">{s.sequence}. {s.name}</span> <span className="font-mono text-xs text-ink-muted">{s.slug}</span>
                        {s.description && <span className="block text-xs text-ink-muted">{s.description}</span>}
                      </span>
                      <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setStage({ stage: s })}>
                        Edit<span className="sr-only"> stage {s.name}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="secondary" className="!min-h-[36px]" onClick={() => setStage({})} icon={<Plus className="h-4 w-4" aria-hidden />}>
                Add a stage<span className="sr-only"> to {e!.name}</span>
              </Button>
            </>
          )}
        </div>
      )}
      {stage && e && <StageDialog exam={e} stage={stage.stage} onClose={() => setStage(null)} />}
    </li>
  );
}

function CategoryDialog({ category, onClose }: { category?: ExamCategory; onClose: () => void }) {
  const edit = !!category;
  const { createCategory, updateCategory } = useCatalogMutations();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState(category?.name ?? "");
  const [hi, setHi] = useState((category?.localized_names as Names | undefined)?.hi ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [order, setOrder] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mut = edit ? updateCategory : createCategory;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!edit && !SLUG.test(slug)) err.slug = SLUG_HELP;
    if (!name.trim()) err.name = "Enter a name.";
    if (!/^-?\d+$/.test(order)) err.order = "Enter a whole number.";
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      if (edit) await updateCategory.mutateAsync({ slug: category!.slug, body: { name: name.trim(), description: description.trim() || null, localized_names: withHindi(category!.localized_names as Names, hi), ...(order !== "0" ? { display_order: Number(order) } : {}) } });
      else await createCategory.mutateAsync({ slug, name: name.trim(), description: description.trim() || null, localized_names: withHindi({}, hi), display_order: Number(order) });
      toast.success(edit ? "Saved." : "Category created.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open title={edit ? "Edit category" : "New category"} onClose={onClose} busy={mut.isPending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {!edit && <Field label="Short code" required error={errors.slug} help={`Cannot be changed later. ${SLUG_HELP}`}>{(p) => <input {...p} value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={64} className={`${inputClass} font-mono`} />}</Field>}
        <Field label="Name" required error={errors.name}>{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />}</Field>
        <Field label="Name in Hindi">{(p) => <input {...p} lang="hi" value={hi} onChange={(e) => setHi(e.target.value)} maxLength={120} className={inputClass} />}</Field>
        <Field label="Description">{(p) => <textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputClass} py-2`} />}</Field>
        <Field label={edit ? "Order (leave 0 to keep the current order)" : "Order in the list"} error={errors.order} help="Smaller numbers come first.">{(p) => <input {...p} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} className={inputClass} />}</Field>
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button type="submit" loading={mut.isPending}>{edit ? "Save changes" : "Create category"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function ExamDialog({ exam, defaultCategory, categories, onClose }: { exam?: Exam; defaultCategory?: string; categories: ExamCategory[]; onClose: () => void }) {
  const edit = !!exam;
  const { createExam, updateExam } = useCatalogMutations();
  const [category, setCategory] = useState(exam?.category.slug ?? defaultCategory ?? categories[0]?.slug ?? "");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState(exam?.name ?? "");
  const [short, setShort] = useState(exam?.short_name ?? "");
  const [body, setBody] = useState(exam?.conducting_body ?? "");
  const [hi, setHi] = useState((exam?.localized_names as Names | undefined)?.hi ?? "");
  const [description, setDescription] = useState(exam?.description ?? "");
  const [order, setOrder] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!category && categories[0]) setCategory(categories[0].slug);
  }, [categories, category]);
  const mut = edit ? updateExam : createExam;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!edit && !SLUG.test(slug)) err.slug = SLUG_HELP;
    if (!name.trim()) err.name = "Enter a name.";
    if (!/^-?\d+$/.test(order)) err.order = "Enter a whole number.";
    setErrors(err);
    if (Object.keys(err).length) return;
    const common = { name: name.trim(), short_name: short.trim() || null, conducting_body: body.trim() || null, description: description.trim() || null };
    try {
      if (edit) await updateExam.mutateAsync({ slug: exam!.slug, body: { ...common, category_slug: category, localized_names: withHindi(exam!.localized_names as Names, hi), ...(order !== "0" ? { display_order: Number(order) } : {}) } });
      else await createExam.mutateAsync({ ...common, category_slug: category, slug, localized_names: withHindi({}, hi), display_order: Number(order) });
      toast.success(edit ? "Saved." : "Exam created. Add a stage next.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open title={edit ? "Edit exam" : "New exam"} onClose={onClose} busy={mut.isPending} wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            {(p) => (
              <select {...p} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            )}
          </Field>
          {!edit && <Field label="Short code" required error={errors.slug} help={`Cannot be changed later. ${SLUG_HELP}`}>{(p) => <input {...p} value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={64} className={`${inputClass} font-mono`} />}</Field>}
          <Field label="Name" required error={errors.name}>{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />}</Field>
          <Field label="Short name" help="For example BPSC.">{(p) => <input {...p} value={short} onChange={(e) => setShort(e.target.value)} maxLength={40} className={inputClass} />}</Field>
          <Field label="Name in Hindi">{(p) => <input {...p} lang="hi" value={hi} onChange={(e) => setHi(e.target.value)} maxLength={120} className={inputClass} />}</Field>
          <Field label="Conducted by">{(p) => <input {...p} value={body} onChange={(e) => setBody(e.target.value)} maxLength={160} className={inputClass} />}</Field>
        </div>
        <Field label="Description">{(p) => <textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputClass} py-2`} />}</Field>
        <Field label={edit ? "Order (leave 0 to keep the current order)" : "Order in the list"} error={errors.order}>{(p) => <input {...p} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} className={inputClass} />}</Field>
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button type="submit" loading={mut.isPending}>{edit ? "Save changes" : "Create exam"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function StageDialog({ exam, stage, onClose }: { exam: Exam; stage?: ExamStage; onClose: () => void }) {
  const edit = !!stage;
  const { createStage, updateStage } = useCatalogMutations();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState(stage?.name ?? "");
  const [seq, setSeq] = useState(String(stage?.sequence ?? exam.stages.length + 1));
  const [description, setDescription] = useState(stage?.description ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mut = edit ? updateStage : createStage;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!edit && !SLUG.test(slug)) err.slug = SLUG_HELP;
    if (!name.trim()) err.name = "Enter a name.";
    if (!/^\d+$/.test(seq) || Number(seq) < 1) err.seq = "Enter the position, starting at 1.";
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      if (edit) await updateStage.mutateAsync({ exam: exam.slug, stage: stage!.slug, body: { name: name.trim(), sequence: Number(seq), description: description.trim() || null } });
      else await createStage.mutateAsync({ exam: exam.slug, body: { slug, name: name.trim(), sequence: Number(seq), description: description.trim() || null } });
      toast.success(edit ? "Saved." : "Stage added.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open title={edit ? `Edit stage of ${exam.name}` : `New stage of ${exam.name}`} onClose={onClose} busy={mut.isPending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {!edit && <Field label="Short code" required error={errors.slug} help={`Cannot be changed later. ${SLUG_HELP}`}>{(p) => <input {...p} value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={64} className={`${inputClass} font-mono`} />}</Field>}
        <Field label="Name" required error={errors.name} help="For example Prelims.">{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />}</Field>
        <Field label="Position in the exam" required error={errors.seq} help="1 is the first stage a candidate sits.">{(p) => <input {...p} inputMode="numeric" value={seq} onChange={(e) => setSeq(e.target.value)} className={inputClass} />}</Field>
        <Field label="Description">{(p) => <textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputClass} py-2`} />}</Field>
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>Cancel</Button>
          <Button type="submit" loading={mut.isPending}>{edit ? "Save changes" : "Add stage"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
