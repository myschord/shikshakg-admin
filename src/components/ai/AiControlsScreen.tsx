"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { stemPreview } from "@/components/questions/parts";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { ALL_FIELDS, GROUPS, type FieldSpec, type Policy, type PolicyValues, type Suspicious } from "@/lib/api/ai";
import { checkedLabel } from "@/lib/date";
import { usePolicy, usePublishPolicy, useSuspicious } from "@/lib/hooks/useAi";
import { useQuestion } from "@/lib/hooks/useQuestions";

type Form = { v: Record<string, string>; b: Record<string, boolean>; off: Record<string, boolean>; pages: { topic: string; page: string }[]; note: string };

const asText = (x: unknown) => (x == null ? "" : String(x));

function toForm(p: Policy): Form {
  const v: Record<string, string> = {};
  const b: Record<string, boolean> = {};
  const off: Record<string, boolean> = {};
  for (const f of ALL_FIELDS) {
    const val = (p.values as Record<string, unknown>)[f.key];
    if (f.kind === "bool") b[f.key] = !!val;
    else if (f.kind === "nullfloat" || f.kind === "nulltext") {
      off[f.key] = val == null;
      v[f.key] = asText(val);
    } else v[f.key] = asText(val);
  }
  const pages = Object.entries((p.values.grounding_pages ?? {}) as Record<string, string>).map(([topic, page]) => ({ topic, page }));
  return { v, b, off, pages, note: "" };
}

/** Reads the form back into the values the backend takes, or says what is wrong with each field. */
function parse(form: Form): { values?: PolicyValues; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};
  const num = (f: FieldSpec & { min: number; max?: number }, s: string, whole: boolean) => {
    const n = Number(s);
    if (s.trim() === "" || !Number.isFinite(n) || (whole && !Number.isInteger(n))) return `Enter ${whole ? "a whole number" : "a number"}.`;
    if (n < f.min || (f.max != null && n > f.max)) return f.max != null ? `Enter a value from ${f.min} to ${f.max}.` : `Enter a value of ${f.min} or more.`;
    return null;
  };
  for (const f of ALL_FIELDS) {
    const s = (form.v[f.key] ?? "").trim();
    let err: string | null = null;
    switch (f.kind) {
      case "bool":
        out[f.key] = !!form.b[f.key];
        break;
      case "int":
        err = num(f, s, true);
        out[f.key] = Number(s);
        break;
      case "float":
        err = num(f, s, false);
        out[f.key] = Number(s);
        break;
      case "money":
        if (!/^\d{1,8}(\.\d{1,2})?$/.test(s)) err = "Enter an amount like 1 or 1.50.";
        out[f.key] = s;
        break;
      case "text":
        if (f.key === "grounding_provider" && !s) err = "Enter a source.";
        else if (f.pattern && !f.pattern.test(s)) err = f.patternHelp ?? "Check the format.";
        else if (f.max && s.length > f.max) err = `Use at most ${f.max} characters.`;
        out[f.key] = s;
        break;
      case "nullfloat":
        if (form.off[f.key]) out[f.key] = null;
        else {
          err = num({ ...f, min: 0, max: 1 }, s, false);
          out[f.key] = Number(s);
        }
        break;
      case "nulltext":
        if (form.off[f.key]) out[f.key] = null;
        else {
          if (!s) err = "Enter a word, or choose no required word.";
          else if (s.length > f.max) err = `Use at most ${f.max} characters.`;
          out[f.key] = s;
        }
        break;
    }
    if (err) errors[f.key] = err;
  }
  const pages: Record<string, string> = {};
  form.pages.forEach((r, i) => {
    const t = r.topic.trim();
    const p = r.page.trim();
    if (!t || !p) errors[`page-${i}`] = "Fill in both the topic and the page title, or remove the row.";
    else if (t in pages) errors[`page-${i}`] = "This topic is already listed.";
    else pages[t] = p;
  });
  out.grounding_pages = pages;
  return Object.keys(errors).length ? { errors } : { values: out as unknown as PolicyValues, errors };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const show = (x: unknown) => (x == null ? "not set" : typeof x === "boolean" ? (x ? "on" : "off") : typeof x === "object" ? `${Object.keys(x as object).length} pages` : String(x));

/** AI settings the backend keeps as numbered versions, and the questions students almost never get right. Admin role only. */
export default function AiControlsScreen() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
        <h1 className="text-2xl font-extrabold">AI controls</h1>
        <p className="mt-1 text-sm text-ink-muted">The limits and checks for AI practice tests and written questions, and the questions that may have a wrong answer key.</p>
      </div>
      <PolicyPanel />
      <SuspiciousPanel />
    </div>
  );
}

function PolicyPanel() {
  const q = usePolicy();
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  // Keyed by version so the form starts over from what the server now holds after a save.
  return <PolicyForm key={`${q.data.version}-${q.data.policy_id}`} policy={q.data as Policy} />;
}

function PolicyForm({ policy }: { policy: Policy }) {
  const publish = usePublishPolicy();
  const [form, setForm] = useState<Form>(() => toForm(policy));
  const [confirm, setConfirm] = useState(false);
  const [shown, setShown] = useState(false);
  const parsed = useMemo(() => parse(form), [form]);
  const errors = shown ? parsed.errors : {};
  const changes = useMemo(() => {
    if (!parsed.values) return [];
    const now = parsed.values as unknown as Record<string, unknown>;
    const was = policy.values as unknown as Record<string, unknown>;
    return ALL_FIELDS.filter((f) => !same(now[f.key], was[f.key] ?? null) && !(f.kind === "money" && Number(now[f.key]) === Number(was[f.key]))).map((f) => ({ label: f.label, from: show(was[f.key]), to: show(now[f.key]) }))
      .concat(same(now.grounding_pages, was.grounding_pages ?? {}) ? [] : [{ label: "Source pages by topic", from: show(was.grounding_pages), to: show(now.grounding_pages) }]);
  }, [parsed.values, policy.values]);
  const dirty = !same(form, toForm(policy));

  const set = (key: string, value: string) => setForm((f) => ({ ...f, v: { ...f.v, [key]: value } }));
  const setBool = (key: string, value: boolean) => setForm((f) => ({ ...f, b: { ...f.b, [key]: value } }));
  const setOff = (key: string, value: boolean) => setForm((f) => ({ ...f, off: { ...f.off, [key]: value } }));

  async function save() {
    if (!parsed.values) return;
    try {
      await publish.mutateAsync({ values: parsed.values, note: form.note.trim() || null });
      toast.success("New version saved. It is in force now.");
      setConfirm(false);
    } catch {}
  }

  const autoOn = parsed.values?.auto_publish && !(policy.values as PolicyValues).auto_publish;
  return (
    <section aria-labelledby="pol-h" className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="pol-h" className="text-xl font-bold">
          Settings
        </h2>
        <Badge tone={policy.version === 0 ? "neutral" : "success"}>{policy.version === 0 ? "Built-in defaults, nothing saved yet" : `Version ${policy.version}, ${policy.source === "exam" ? "for one exam" : "for all exams"}`}</Badge>
      </div>
      <p className="text-sm text-ink-muted">These settings apply to all exams. Saving makes a new version and puts it in force straight away; the earlier version is kept by the server.</p>
      {!policy.thresholds_calibrated && (
        <p role="note" className="rounded-xl border border-warning bg-warning-tint p-3 text-sm">
          A similarity limit is not measured yet, so questions the AI writes are never published automatically.
        </p>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setShown(true);
          if (parsed.values && changes.length) setConfirm(true);
        }}
        className="space-y-6"
      >
        {GROUPS.map((g) => (
          <fieldset key={g.id} className="space-y-4 rounded-2xl border border-line bg-white p-5">
            <legend className="px-1 text-base font-bold">{g.title}</legend>
            <p className="text-sm text-ink-muted">{g.intro}</p>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {g.fields.map((f) =>
                f.kind === "bool" ? (
                  <div key={f.key} className="sm:col-span-2">
                    <label className="flex min-h-[44px] items-start gap-3 text-sm">
                      <input type="checkbox" checked={!!form.b[f.key]} onChange={(e) => setBool(f.key, e.target.checked)} className="mt-1 h-4 w-4 accent-primary" aria-describedby={f.help ? `${f.key}-h` : undefined} />
                      <span>
                        <span className="font-semibold">{f.label}</span>
                        {f.help && (
                          <span id={`${f.key}-h`} className="block text-ink-muted">
                            {f.help}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                ) : (
                  <Field key={f.key} label={f.label} error={errors[f.key]} help={f.help}>
                    {(p) => (
                      <>
                        <input {...p} value={form.v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} inputMode={f.kind === "text" || f.kind === "nulltext" ? "text" : "decimal"} disabled={(f.kind === "nullfloat" || f.kind === "nulltext") && form.off[f.key]} className={inputClass} />
                        {(f.kind === "nullfloat" || f.kind === "nulltext") && (
                          <label className="mt-1 flex min-h-[44px] items-center gap-2 text-sm">
                            <input type="checkbox" checked={!!form.off[f.key]} onChange={(e) => setOff(f.key, e.target.checked)} className="h-4 w-4 accent-primary" />
                            {f.offLabel}
                          </label>
                        )}
                      </>
                    )}
                  </Field>
                ),
              )}
            </div>
            {g.id === "grounding" && <PagesEditor rows={form.pages} errors={errors} onChange={(pages) => setForm((f) => ({ ...f, pages }))} />}
          </fieldset>
        ))}

        <Field label="Note for this version (optional)" help="Why you are changing it. Kept with the version.">{(p) => <input {...p} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} maxLength={500} className={inputClass} />}</Field>
        {shown && Object.keys(parsed.errors).length > 0 && (
          <p role="alert" className="text-sm font-semibold text-error-text">
            {Object.keys(parsed.errors).length} {Object.keys(parsed.errors).length === 1 ? "setting needs" : "settings need"} fixing before you can save.
          </p>
        )}
        {shown && parsed.values && changes.length === 0 && <p role="status" className="text-sm text-ink-muted">Nothing is different from the version in force.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">
            Review and save
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setForm(toForm(policy)); setShown(false); }} disabled={!dirty}>
            Undo my changes
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirm}
        title="Save a new version?"
        confirmLabel="Save and use now"
        busy={publish.isPending}
        error={publish.error}
        onCancel={() => {
          publish.reset();
          setConfirm(false);
        }}
        onConfirm={save}
      >
        <p>It takes effect straight away for all exams. These settings change:</p>
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-lg bg-bg-tint p-3 text-ink">
          {changes.map((c) => (
            <li key={c.label}>
              <strong>{c.label}:</strong> {c.from} to {c.to}
            </li>
          ))}
        </ul>
        {autoOn && <p className="font-semibold text-error-text">Questions the AI writes will be published without a person reading them first (apart from the share you chose above).</p>}
      </ConfirmDialog>
    </section>
  );
}

function PagesEditor({ rows, errors, onChange }: { rows: { topic: string; page: string }[]; errors: Record<string, string>; onChange: (r: { topic: string; page: string }[]) => void }) {
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <h3 className="font-bold">Source page for a topic</h3>
      <p className="text-sm text-ink-muted">A topic name alone can find the wrong page. Name the exact Wikipedia page for a topic here; other topics are searched for.</p>
      {rows.length === 0 && <p className="text-sm text-ink-muted">No pages chosen.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3">
          <Field label={`Topic code, row ${i + 1}`} className="min-w-[12rem] flex-1">{(p) => <input {...p} value={r.topic} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)))} className={`${inputClass} font-mono`} />}</Field>
          <Field label={`Page title, row ${i + 1}`} error={errors[`page-${i}`]} className="min-w-[12rem] flex-1">{(p) => <input {...p} value={r.page} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, page: e.target.value } : x)))} className={inputClass} />}</Field>
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-error-text hover:bg-error-tint" aria-label={`Remove row ${i + 1}`}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...rows, { topic: "", page: "" }])} icon={<Plus className="h-4 w-4" aria-hidden />}>
        Add a page
      </Button>
    </div>
  );
}

function Preview({ id }: { id: string }) {
  const q = useQuestion(id);
  return (
    <>
      <Link href={`/questions/view?id=${id}`} className="font-semibold text-primary hover:underline">
        {q.data ? stemPreview(q.data, 120) : q.isError ? "Open the question" : "Loading…"}
      </Link>
      <span className="block font-mono text-xs text-ink-muted">{id.slice(0, 8)}</span>
    </>
  );
}

function SuspiciousPanel() {
  const [limit, setLimit] = useState(25);
  const q = useSuspicious(limit);
  const columns: Column<Suspicious>[] = [
    { key: "q", header: "Question", cell: (r) => <Preview id={r.question_id} /> },
    { key: "a", header: "Answered", align: "right", cell: (r) => r.attempts },
    { key: "c", header: "Got it right", align: "right", cell: (r) => `${r.correct} (${Math.round(Number(r.correct_rate) * 100)}%)` },
    { key: "t", header: "Typical time", align: "right", cell: (r) => (r.p50_time_ms ? `${Math.round(r.p50_time_ms / 1000)} s` : "") },
    { key: "d", header: "Worked out", cell: (r) => <span className="whitespace-nowrap">{checkedLabel(r.computed_at).replace(/ \(.*\)$/, "")}</span> },
  ];
  return (
    <section aria-labelledby="sus-h" className="space-y-4">
      <h2 id="sus-h" className="text-xl font-bold">
        Questions to double-check
      </h2>
      <p className="text-sm text-ink-muted">Almost nobody gets these right, worst first. That can mean the answer key is wrong, or the question is simply very hard. Open one and check the key.</p>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <DataTable caption="Questions that students almost never answer correctly" columns={columns} rows={q.data} rowKey={(r) => r.question_id} loading={q.isPending} empty={<><p className="font-semibold text-ink">Nothing to check right now</p><p className="mt-1">Questions appear here once enough students have answered them.</p></>} />}
      {q.data && q.data.length >= limit && limit < 100 && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => setLimit((l) => Math.min(100, l + 25))} loading={q.isFetching}>
            Show more
          </Button>
        </div>
      )}
    </section>
  );
}
