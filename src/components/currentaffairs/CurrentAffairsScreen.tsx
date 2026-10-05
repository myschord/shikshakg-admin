"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { CA_MOVES, CA_STATUS_LABEL, IMPORTANCE_LABEL, caText, type CaInput, type CaItem, type CaStatus, type CaTranslation, type Importance } from "@/lib/api/a8";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDay, todayIst } from "@/lib/date";
import { useCaItems, useCaMutations } from "@/lib/hooks/useA8";
import { useCategories, useExam } from "@/lib/hooks/useExamEvents";
import { useSyllabus } from "@/lib/hooks/useQuestions";

const TONE = { draft: "warning", in_review: "info", published: "success", retired: "neutral" } as const;
const MOVE_LABEL: Record<CaStatus, string> = { in_review: "Send for review", published: "Publish", draft: "Back to draft", retired: "Retire" };
const https = (v: string) => /^https:\/\/[^\s]+$/.test(v);

/** Daily news items for students, written here and checked before they go live. Editors write, administrators publish. */
export default function CurrentAffairsScreen() {
  const { user } = useAuth();
  const categories = useCategories();
  const [exam, setExam] = useState("");
  const [status, setStatus] = useState("");
  const list = useCaItems({ exam: exam || undefined, status: status || undefined });
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);
  const m = useCaMutations();
  const [form, setForm] = useState<{ item?: CaItem } | null>(null);
  const [move, setMove] = useState<{ item: CaItem; to: CaStatus } | null>(null);
  const [note, setNote] = useState("");

  const columns: Column<CaItem>[] = [
    {
      key: "t",
      header: "Item",
      cell: (c) => (
        <>
          <span className="font-semibold">{caText(c).headline}</span>
          <span className="block max-w-md truncate text-xs text-ink-muted">{caText(c).summary}</span>
          {c.translations.some((t) => t.language === "hi") && <Badge tone="info" className="mt-1">Hindi added</Badge>}
        </>
      ),
    },
    { key: "e", header: "Exams", cell: (c) => c.exam_slugs.join(", ") },
    { key: "d", header: "News of", cell: (c) => <span className="whitespace-nowrap">{formatDay(c.published_on)}</span> },
    { key: "i", header: "Importance", cell: (c) => IMPORTANCE_LABEL[c.importance] },
    { key: "s", header: "State", cell: (c) => <Badge tone={TONE[c.status]}>{CA_STATUS_LABEL[c.status]}</Badge> },
    {
      key: "a",
      header: "Actions",
      cell: (c) => (
        <div className="flex flex-wrap gap-2">
          {(c.status === "draft" || c.status === "in_review") && (
            <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setForm({ item: c })}>
              Edit<span className="sr-only"> {caText(c).headline}</span>
            </Button>
          )}
          {CA_MOVES[c.status].map((to) =>
            (to === "published" || to === "retired") && user?.role !== "admin" ? null : (
              <Button key={to} variant={to === "published" ? "primary" : "ghost"} className="!min-h-[36px] !px-3" onClick={() => { setNote(""); setMove({ item: c, to }); }}>
                {MOVE_LABEL[to]}
                <span className="sr-only"> {caText(c).headline}</span>
              </Button>
            ),
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Current affairs</h1>
          <p className="mt-1 text-sm text-ink-muted">Short news items with a source link, shown to students of the chosen exams once an administrator publishes them. Editors write and send for review.</p>
        </div>
        <Button onClick={() => setForm({})} icon={<Plus className="h-4 w-4" aria-hidden />}>
          New item
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Exam" className="min-w-[14rem]">{(p) => <ExamSelect {...p} allLabel="All exams" value={exam} onChange={setExam} />}</Field>
        <Field label="State" className="min-w-[10rem]">
          {(p) => (
            <select {...p} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">All</option>
              {Object.entries(CA_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : <DataTable caption="Current affairs items" columns={columns} rows={rows} rowKey={(c) => c.id} loading={list.isPending || categories.isPending} empty={<p className="font-semibold text-ink">No items</p>} />}
      <ItemForm open={!!form} item={form?.item} defaultExam={exam} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!move}
        title={move ? `${MOVE_LABEL[move.to]}?` : ""}
        confirmLabel={move ? MOVE_LABEL[move.to] : ""}
        danger={move?.to === "retired"}
        busy={m.setStatus.isPending}
        error={m.setStatus.error}
        onCancel={() => {
          m.setStatus.reset();
          setMove(null);
        }}
        onConfirm={async () => {
          if (!move) return;
          try {
            await m.setStatus.mutateAsync({ id: move.item.id, status: move.to, note: note.trim() || undefined });
            toast.success("Done.");
            setMove(null);
          } catch {}
        }}
      >
        {move && (
          <>
            <p className="rounded-lg bg-bg-tint px-3 py-2 text-ink">
              <strong>{caText(move.item).headline}</strong> is {CA_STATUS_LABEL[move.item.status].toLowerCase()}.
            </p>
            {move.to === "published" && <p>Students of {move.item.exam_slugs.join(", ")} will see it.</p>}
            {move.to === "retired" && <p>Students will no longer see it. A retired item can be sent back to draft and fixed.</p>}
            <Field label="Note (optional)">{(p) => <input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputClass} />}</Field>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

function ItemForm({ open, item, defaultExam, onClose }: { open: boolean; item?: CaItem; defaultExam: string; onClose: () => void }) {
  const edit = !!item;
  const categories = useCategories();
  const { create, update } = useCaMutations();
  const [exam, setExam] = useState("");
  const [also, setAlso] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [titleHi, setTitleHi] = useState("");
  const [summaryHi, setSummaryHi] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [on, setOn] = useState("");
  const [importance, setImportance] = useState<Importance>(2);
  const [topic, setTopic] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const allExams = useMemo(() => (categories.data ?? []).flatMap((c) => c.exams), [categories.data]);
  const examValue = exam || item?.exam_slugs[0] || defaultExam || allExams[0]?.slug || "";
  const examData = useExam(examValue || null);
  const stage = examData.data?.stages?.[0]?.slug ?? null;
  const syllabus = useSyllabus(examValue || null, (examData.data?.stages?.length ?? 0) > 1 ? stage : null);
  const allTopics = useMemo(() => (syllabus.data?.subjects ?? []).flatMap((s) => s.topics.map((t) => ({ id: t.id, name: `${s.name}: ${t.name}` }))), [syllabus.data]);
  const mut = edit ? update : create;

  useEffect(() => {
    if (!open) return;
    const en = item?.translations.find((t) => t.language === "en");
    const hi = item?.translations.find((t) => t.language === "hi");
    setExam(item?.exam_slugs[0] ?? "");
    setAlso(item?.exam_slugs.slice(1) ?? []);
    setTitle(en?.headline ?? "");
    setSummary(en?.summary ?? "");
    setTitleHi(hi?.headline ?? "");
    setSummaryHi(hi?.summary ?? "");
    setSourceName(item?.source_name ?? "");
    setSourceUrl(item?.source_url ?? "");
    setOn(item?.published_on ?? todayIst());
    setImportance(item?.importance ?? 2);
    setTopic(item?.topic?.id ?? "");
    setErrors({});
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!title.trim()) err.title = "Write the headline.";
    if (!summary.trim()) err.summary = "Write a short summary.";
    if (!!titleHi.trim() !== !!summaryHi.trim()) err.hi = "Write both the Hindi headline and summary, or leave both empty.";
    if (!sourceName.trim()) err.sourceName = "Name the source, for example PIB.";
    if (!https(sourceUrl.trim())) err.sourceUrl = "Enter the source link, starting with https://.";
    if (!on) err.on = "Choose the day of the news.";
    else if (on > todayIst()) err.on = "The news cannot be from a future day.";
    setErrors(err);
    if (Object.keys(err).length) return;
    const translations: CaTranslation[] = [{ language: "en", headline: title.trim(), summary: summary.trim() }];
    if (titleHi.trim()) translations.push({ language: "hi", headline: titleHi.trim(), summary: summaryHi.trim() });
    const body: CaInput = {
      exam_slugs: [examValue, ...also.filter((s) => s !== examValue)],
      importance,
      topic_id: topic || null,
      source_name: sourceName.trim(),
      source_url: sourceUrl.trim(),
      published_on: on,
      translations,
    };
    try {
      if (edit) await update.mutateAsync({ id: item!.id, body });
      else await create.mutateAsync(body);
      toast.success(edit ? "Saved." : "Item saved as a draft.");
      onClose();
    } catch {}
  }

  return (
    <Dialog open={open} title={edit ? "Edit item" : "New item"} onClose={onClose} busy={mut.isPending} wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exam" required>{(p) => <ExamSelect {...p} value={examValue} onChange={setExam} />}</Field>
          <Field label="Day of the news" required error={errors.on}>{(p) => <input {...p} type="date" max={todayIst()} value={on} onChange={(e) => setOn(e.target.value)} className={inputClass} />}</Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Also for these exams (optional)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {allExams
              .filter((x) => x.slug !== examValue)
              .map((x) => (
                <label key={x.slug} className="flex min-h-[44px] items-center gap-2 text-sm">
                  <input type="checkbox" checked={also.includes(x.slug)} onChange={(e) => setAlso((cur) => (e.target.checked ? [...cur, x.slug] : cur.filter((s) => s !== x.slug)))} className="h-4 w-4 accent-primary" />
                  {x.short_name || x.name}
                </label>
              ))}
          </div>
        </fieldset>
        <Field label="Headline" required error={errors.title} help={`${title.length} of 200`}>{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />}</Field>
        <Field label="Summary" required error={errors.summary} help={`${summary.length} of 600. Say what happened and why an aspirant should care.`}>{(p) => <textarea {...p} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={600} rows={4} className={`${inputClass} py-2`} />}</Field>
        <details className="rounded-xl border border-line p-3" open={!!(titleHi || summaryHi)}>
          <summary className="cursor-pointer text-sm font-semibold">Hindi version (optional)</summary>
          <p className="mt-1 text-xs text-ink-muted">Students who read Hindi see this; everyone else sees the English above.</p>
          {errors.hi && <p role="alert" className="mt-1 text-sm text-error-text">{errors.hi}</p>}
          <div className="mt-3 space-y-3">
            <Field label="Hindi headline" help={`${titleHi.length} of 200`}>{(p) => <input {...p} lang="hi" value={titleHi} onChange={(e) => setTitleHi(e.target.value)} maxLength={200} className={inputClass} />}</Field>
            <Field label="Hindi summary" help={`${summaryHi.length} of 600`}>{(p) => <textarea {...p} lang="hi" value={summaryHi} onChange={(e) => setSummaryHi(e.target.value)} maxLength={600} rows={3} className={`${inputClass} py-2`} />}</Field>
          </div>
        </details>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Source name" required error={errors.sourceName}>{(p) => <input {...p} value={sourceName} onChange={(e) => setSourceName(e.target.value)} maxLength={80} className={inputClass} />}</Field>
          <Field label="Source link" required error={errors.sourceUrl}>{(p) => <input {...p} type="url" inputMode="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" className={inputClass} />}</Field>
          <Field label="Importance">
            {(p) => (
              <select {...p} value={importance} onChange={(e) => setImportance(Number(e.target.value) as Importance)} className={inputClass}>
                {([1, 2, 3] as Importance[]).map((i) => (
                  <option key={i} value={i}>
                    {IMPORTANCE_LABEL[i]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Topic (optional)" help="From the first exam's syllabus.">
            {(p) => (
              <select {...p} value={topic} onChange={(e) => setTopic(e.target.value)} className={inputClass} disabled={syllabus.isPending}>
                <option value="">No topic</option>
                {allTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mut.isPending}>
            {edit ? "Save changes" : "Save draft"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
