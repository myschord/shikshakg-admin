"use client";

import { useMemo, useState } from "react";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import type { LogEntry } from "@/lib/api/a8";
import { formatDay, istDay } from "@/lib/date";
import { useEntityTypes, useLog } from "@/lib/hooks/useA8";

const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));
/** "courses.lecture_updated" read as "Courses: lecture updated". */
const words = (action: string) => {
  const [area, ...rest] = action.split(".");
  const what = rest.join(" ").replace(/_/g, " ");
  return `${area[0].toUpperCase()}${area.slice(1).replace(/_/g, " ")}: ${what}`;
};
/** Who did it: an operator command from the command line has no account. */
const who = (email: string | null) => email ?? "Operator (command line)";

/** What staff changed, who did it and when, with the values before and after. Read only. */
export default function ActionLogScreen() {
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [applied, setApplied] = useState({ actor: "", action: "" });
  const list = useLog({ actor: applied.actor || undefined, action: applied.action || undefined, entityType: entity || undefined });
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);
  const entityTypes = useEntityTypes();
  const [open, setOpen] = useState<LogEntry | null>(null);

  const columns: Column<LogEntry>[] = [
    { key: "t", header: "When", cell: (l) => <span className="whitespace-nowrap">{formatDay(istDay(l.at))}, {time(l.at)}</span> },
    { key: "a", header: "Who", cell: (l) => <span className="break-all">{who(l.actor_email)}</span> },
    { key: "w", header: "What", cell: (l) => words(l.action) },
    { key: "e", header: "On", cell: (l) => <><span className="capitalize">{l.entity_type.replace(/_/g, " ")}</span><span className="block font-mono text-xs text-ink-muted">{l.entity_id.slice(0, 12)}</span></> },
    {
      key: "d",
      header: "Details",
      cell: (l) => (
        <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setOpen(l)}>
          Open<span className="sr-only"> {words(l.action)} by {who(l.actor_email)}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Action log</h1>
        <p className="mt-1 text-sm text-ink-muted">Every change staff make, newest first. Times are India time.</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ actor: actor.trim(), action: action.trim() });
        }}
      >
        <Field label="Who (email)" className="min-w-[14rem] flex-1">{(p) => <input {...p} type="search" value={actor} onChange={(e) => setActor(e.target.value)} className={inputClass} />}</Field>
        <Field label="What starts with" className="min-w-[12rem]" help="For example commerce or courses.">{(p) => <input {...p} type="search" value={action} onChange={(e) => setAction(e.target.value)} className={inputClass} />}</Field>
        <Field label="On" className="min-w-[12rem]">
          {(p) => (
            <select {...p} value={entity} onChange={(e) => setEntity(e.target.value)} className={inputClass}>
              <option value="">Anything</option>
              {(entityTypes.data ?? []).map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : <DataTable caption="Staff actions" columns={columns} rows={rows} rowKey={(l) => l.id} loading={list.isPending} empty={<p className="font-semibold text-ink">Nothing matches</p>} />}
      <Dialog open={!!open} title="Action details" onClose={() => setOpen(null)} wide>
        {open && (
          <div className="space-y-4 text-sm">
            <p>
              <strong>{words(open.action)}</strong> by <span className="break-all">{who(open.actor_email)}</span>, {formatDay(istDay(open.at))} at {time(open.at)}.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Values title="Before" value={open.before} />
              <Values title="After" value={open.after} />
            </div>
            <div className="text-right">
              <Button variant="secondary" onClick={() => setOpen(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Values({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  return (
    <section aria-label={title} className="rounded-xl bg-bg-tint p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{title}</h3>
      {!value || Object.keys(value).length === 0 ? (
        <p className="text-ink-muted">Nothing recorded</p>
      ) : (
        <dl className="space-y-1">
          {Object.entries(value).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold text-ink-muted">{k.replace(/_/g, " ")}</dt>
              <dd className="break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
