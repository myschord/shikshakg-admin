"use client";

import { useEffect, useState } from "react";
import Button from "@/components/kit/Button";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { CERTAINTY_LABEL, KIND_LABEL, KINDS, type AdminEvent, type Certainty, type EventFields, type EventKind } from "@/lib/api/examEvents";
import type { ExamStage } from "@/lib/api/catalog";
import { istDay, todayIst } from "@/lib/date";
import { useEventMutations } from "@/lib/hooks/useExamEvents";

export type FormMode = "create" | "edit" | "revise";
const TITLE: Record<FormMode, string> = { create: "Add an exam date", edit: "Edit draft", revise: "Correct a published date" };
const SUBMIT: Record<FormMode, string> = { create: "Save draft", edit: "Save draft", revise: "Save correction as a draft" };

/** Official sources only, and only over https: the backend refuses anything else, and so does this form before it asks. */
const validUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname.includes(".");
  } catch {
    return false;
  }
};

type Errors = Partial<Record<"kind" | "title" | "starts" | "ends" | "source" | "checked", string>>;

export default function EventForm({
  open,
  mode,
  examSlug,
  examName,
  stages,
  event,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: FormMode;
  examSlug: string;
  examName: string;
  stages: ExamStage[];
  event?: AdminEvent;
  onClose: () => void;
  onDone: (saved: AdminEvent) => void;
}) {
  const m = useEventMutations(examSlug);
  const [kind, setKind] = useState<EventKind | "">("");
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [certainty, setCertainty] = useState<Certainty>("tentative");
  const [source, setSource] = useState("");
  const [checkedToday, setCheckedToday] = useState(true);
  const [checkedOn, setCheckedOn] = useState(todayIst());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<unknown>(null);

  // Start from the existing date when editing or correcting, and from a blank form otherwise.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setKind(event?.kind ?? "");
    setTitle(event?.title ?? "");
    setStage(event?.stage_slug ?? "");
    setStarts(event?.starts_on ?? "");
    setEnds(event?.ends_on ?? "");
    setCertainty(event?.certainty ?? "tentative");
    setSource(event?.source_url ?? "");
    setNote(event?.note ?? "");
    // A correction must be checked against the source again, so it starts from "I checked it today".
    setCheckedToday(mode !== "edit" || !event);
    setCheckedOn(event ? istDay(event.source_checked_at) : todayIst());
  }, [open, event, mode]);

  const busy = m.create.isPending || m.updateDraft.isPending || m.revise.isPending;

  function validate(): Errors {
    const e: Errors = {};
    if (mode === "create" && !kind) e.kind = "Choose what this date is for.";
    if (!title.trim()) e.title = "Enter a title students will understand.";
    if (!starts) e.starts = "Enter the date, or the first day.";
    if (ends && starts && ends < starts) e.ends = "The last day cannot be before the first day.";
    if (!source.trim()) e.source = "An official source link is required.";
    else if (!validUrl(source.trim())) e.source = "Use a full link that starts with https://";
    if (!checkedToday && checkedOn > todayIst()) e.checked = "The date you checked cannot be in the future.";
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const found = validate();
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length) return;

    const fields: EventFields = {
      title: title.trim(),
      starts_on: starts,
      ends_on: ends || null,
      certainty,
      source_url: source.trim(),
      // "Checked today" lets the server stamp the time. An earlier date is sent as the start of that India day.
      source_checked_at: checkedToday || checkedOn === todayIst() ? null : `${checkedOn}T00:00:00+05:30`,
      stage_slug: stage || null,
      note: note.trim() || null,
    };
    try {
      let saved: AdminEvent;
      if (mode === "create") saved = await m.create.mutateAsync({ ...fields, kind: kind as EventKind });
      else if (mode === "edit" && event) saved = await m.updateDraft.mutateAsync({ id: event.id, body: fields });
      else if (event) saved = await m.revise.mutateAsync({ id: event.id, body: fields });
      else return;
      onDone(saved);
    } catch (err) {
      setServerError(err);
    }
  }

  return (
    <Dialog open={open} title={`${TITLE[mode]}: ${examName}`} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {mode === "revise" && <p className="rounded-lg bg-border-tint px-3 py-2 text-sm text-ink-muted">Students keep seeing the published date until you publish this correction. Publishing it replaces the old date.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What is this date for?" required error={errors.kind}>
            {(p) => (
              <select {...p} value={kind} onChange={(e) => setKind(e.target.value as EventKind)} disabled={mode !== "create"} className={inputClass}>
                <option value="">Choose…</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Which stage?" help="Leave as whole exam if it applies to every stage.">
            {(p) => (
              <select {...p} value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
                <option value="">Whole exam</option>
                {stages.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Title" required error={errors.title} help="For example: Tier 1 examination">
          {(p) => <input {...p} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputClass} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date (IST)" required error={errors.starts} help="First day, as published.">
            {(p) => <input {...p} type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Last day" error={errors.ends} help="Only for a window or a multi-day exam.">
            {(p) => <input {...p} type="date" value={ends} min={starts || undefined} onChange={(e) => setEnds(e.target.value)} className={inputClass} />}
          </Field>
          <Field label="How sure is it?" help="Students see tentative dates as expected.">
            {(p) => (
              <select {...p} value={certainty} onChange={(e) => setCertainty(e.target.value as Certainty)} className={inputClass}>
                {(Object.keys(CERTAINTY_LABEL) as Certainty[]).map((c) => (
                  <option key={c} value={c}>
                    {CERTAINTY_LABEL[c]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Official source link" required error={errors.source} help="The page on the official website that states this date. Students see this link.">
          {(p) => <input {...p} type="url" inputMode="url" value={source} placeholder="https://" onChange={(e) => setSource(e.target.value)} className={inputClass} />}
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">When did you check the source?</legend>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={checkedToday} onChange={(e) => setCheckedToday(e.target.checked)} className="h-4 w-4 accent-primary" />I opened the source and checked this date today
          </label>
          {!checkedToday && (
            <Field label="Date checked" error={errors.checked}>
              {(p) => <input {...p} type="date" value={checkedOn} max={todayIst()} onChange={(e) => setCheckedOn(e.target.value)} className={`${inputClass} max-w-[14rem]`} />}
            </Field>
          )}
        </fieldset>
        <Field label="Internal note" help="Only staff see this.">
          {(p) => <textarea {...p} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} py-2`} />}
        </Field>

        {serverError ? <ErrorState compact error={serverError} /> : null}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {SUBMIT[mode]}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
