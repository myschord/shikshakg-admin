"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { ANNOUNCEMENT_STATUS_LABEL, type Announcement } from "@/lib/api/a8";
import { formatDay, fromIstLocalInput, istDay, toIstLocalInput } from "@/lib/date";
import { useAnnouncementMutations, useAnnouncements } from "@/lib/hooks/useA8";

const TONE = { draft: "warning", scheduled: "info", sent: "success", cancelled: "neutral" } as const;
const when = (iso: string) => `${formatDay(istDay(iso))}, ${toIstLocalInput(iso).slice(11)}`;

/** Messages that land in students' inboxes (and, if chosen, as a push). A sent message cannot be recalled. */
export default function AnnouncementsScreen() {
  const [status, setStatus] = useState("");
  const list = useAnnouncements(status);
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);
  const m = useAnnouncementMutations();
  const [form, setForm] = useState<{ a?: Announcement } | null>(null);
  const [act, setAct] = useState<{ kind: "send" | "cancel"; a: Announcement } | null>(null);

  const columns: Column<Announcement>[] = [
    {
      key: "t",
      header: "Message",
      cell: (a) => (
        <>
          <span className="font-semibold">{a.title}</span>
          <span className="block max-w-md truncate text-xs text-ink-muted">{a.body}</span>
        </>
      ),
    },
    { key: "w", header: "To", cell: (a) => (a.exam_slug ? `Students of ${a.exam_slug}` : "All students") },
    {
      key: "s",
      header: "State",
      cell: (a) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={TONE[a.status]}>{ANNOUNCEMENT_STATUS_LABEL[a.status]}</Badge>
          {a.send_push && <Badge tone="info">Push too</Badge>}
        </div>
      ),
    },
    {
      key: "d",
      header: "Time",
      cell: (a) => <span className="whitespace-nowrap">{a.status === "sent" && a.sent_at ? `Sent ${when(a.sent_at)}` : a.send_at ? `Goes out ${when(a.send_at)}` : "Not scheduled"}</span>,
    },
    { key: "r", header: "Reached", align: "right", cell: (a) => (a.recipients == null ? "" : `${a.recipients} (${a.read_count ?? 0} read)`) },
    {
      key: "a",
      header: "Actions",
      cell: (a) =>
        a.status === "draft" || a.status === "scheduled" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setForm({ a })}>
              Edit<span className="sr-only"> {a.title}</span>
            </Button>
            <Button className="!min-h-[36px] !px-3" onClick={() => setAct({ kind: "send", a })}>
              Send now<span className="sr-only"> {a.title}</span>
            </Button>
            <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setAct({ kind: "cancel", a })}>
              Cancel<span className="sr-only"> {a.title}</span>
            </Button>
          </div>
        ) : null,
    },
  ];

  const mut = act ? (act.kind === "send" ? m.sendNow : m.cancel) : null;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Announcements</h1>
          <p className="mt-1 text-sm text-ink-muted">Tell students something: a new test series, a change of date, a maintenance window.</p>
        </div>
        <Button onClick={() => setForm({})} icon={<Megaphone className="h-4 w-4" aria-hidden />}>
          New announcement
        </Button>
      </div>
      <Field label="Show" className="max-w-xs">
        {(p) => (
          <select {...p} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="">All</option>
            {Object.entries(ANNOUNCEMENT_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        )}
      </Field>
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : <DataTable caption="Announcements" columns={columns} rows={rows} rowKey={(a) => a.id} loading={list.isPending} empty={<p className="font-semibold text-ink">No announcements</p>} />}
      <AnnouncementForm open={!!form} announcement={form?.a} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!act}
        title={act?.kind === "send" ? "Send this to students now?" : "Cancel this announcement?"}
        confirmLabel={act?.kind === "send" ? "Send now" : "Cancel announcement"}
        danger={act?.kind === "cancel"}
        busy={mut?.isPending}
        error={mut?.error}
        onCancel={() => {
          mut?.reset();
          setAct(null);
        }}
        onConfirm={async () => {
          if (!act || !mut) return;
          try {
            await mut.mutateAsync(act.a.id);
            toast.success(act.kind === "send" ? "Sent." : "Cancelled.");
            setAct(null);
          } catch {}
        }}
      >
        {act && (
          <>
            <p className="rounded-lg bg-bg-tint px-3 py-2 text-ink">
              <strong>{act.a.title}</strong>
              <span className="block">{act.a.body}</span>
            </p>
            {act.kind === "send" ? <p>It goes to {act.a.exam_slug ? `students of ${act.a.exam_slug}` : "all students"} straight away{act.a.send_push ? ", with a push notification" : ""}. A sent message cannot be taken back.</p> : <p>It will not be sent.</p>}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

function AnnouncementForm({ open, announcement, onClose }: { open: boolean; announcement?: Announcement; onClose: () => void }) {
  const { create, update } = useAnnouncementMutations();
  const edit = !!announcement;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [exam, setExam] = useState("");
  const [push, setPush] = useState(false);
  const [at, setAt] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setTitle(announcement?.title ?? "");
    setBody(announcement?.body ?? "");
    setLink(announcement?.deep_link ?? "");
    setExam(announcement?.exam_slug ?? "");
    setPush(announcement?.send_push ?? false);
    setAt(toIstLocalInput(announcement?.send_at));
    setErrors({});
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, announcement]);
  const mut = edit ? update : create;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!title.trim()) err.title = "Enter a title.";
    if (!body.trim()) err.body = "Write the message.";
    if (link && !/^(\/[^\s]*|https:\/\/[^\s]+)$/.test(link.trim())) err.link = "Use a path that starts with / (like /exams/bpsc/tests) or an https address.";
    if (at && new Date(fromIstLocalInput(at)).getTime() < Date.now() + 60_000) err.at = "Choose a time at least a minute from now.";
    setErrors(err);
    if (Object.keys(err).length) return;
    const input = { title: title.trim(), body: body.trim(), deep_link: link.trim() || null, exam_slug: exam || null, send_push: push, send_at: at ? fromIstLocalInput(at) : null };
    try {
      if (edit) await update.mutateAsync({ id: announcement!.id, body: input });
      else await create.mutateAsync(input);
      toast.success(at ? "Scheduled." : "Saved as a draft.");
      onClose();
    } catch {}
  }

  return (
    <Dialog open={open} title={edit ? "Edit announcement" : "New announcement"} onClose={onClose} busy={mut.isPending} wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Title" required error={errors.title} help={`${title.length} of 120`}>{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputClass} />}</Field>
        <Field label="Message" required error={errors.body} help={`${body.length} of 1000`}>{(p) => <textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={4} className={`${inputClass} py-2`} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Send to">{(p) => <ExamSelect {...p} allLabel="All students" value={exam} onChange={setExam} />}</Field>
          <Field label="Where tapping it goes (optional)" error={errors.link} help="A page in the app, like /exams/bpsc/tests.">{(p) => <input {...p} value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} className={inputClass} />}</Field>
          <Field label="Send at (optional)" error={errors.at} help="India time. Leave empty to keep it as a draft and send it yourself.">{(p) => <input {...p} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={inputClass} />}</Field>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="h-4 w-4 accent-primary" />
          Also send a push notification to students who turned them on
        </label>
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mut.isPending}>
            {edit ? "Save changes" : at ? "Schedule" : "Save draft"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
