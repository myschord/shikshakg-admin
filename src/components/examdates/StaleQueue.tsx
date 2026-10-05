"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import ActionDialog, { type EventAction } from "@/components/examdates/ActionDialog";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ErrorState from "@/components/kit/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { KIND_LABEL, type AdminEvent } from "@/lib/api/examEvents";
import { daysSince, formatDay, todayIst } from "@/lib/date";
import { useCategories, useStale } from "@/lib/hooks/useExamEvents";

const OLDER = [14, 30, 60];
const WITHIN = [30, 60, 120];

const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${todayIst()}T00:00:00Z`).getTime()) / 86_400_000);

/** Published dates that start soon but were last checked against their source long ago, most overdue first. */
export default function StaleQueue() {
  const [older, setOlder] = useState(30);
  const [within, setWithin] = useState(60);
  const q = useStale(older, within);
  const categories = useCategories();
  const [action, setAction] = useState<EventAction>(null);
  const names = useMemo(() => new Map((categories.data ?? []).flatMap((c) => c.exams.map((x) => [x.slug, x.short_name || x.name] as const))), [categories.data]);

  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => daysSince(b.source_checked_at) - daysSince(a.source_checked_at)), [q.data]);

  const columns: Column<AdminEvent>[] = [
    { key: "exam", header: "Exam", cell: (e) => <Link href={`/exam-dates?exam=${e.exam_slug}`} className="font-semibold text-primary hover:underline">{names.get(e.exam_slug) ?? e.exam_slug}</Link> },
    {
      key: "what",
      header: "Date",
      cell: (e) => (
        <>
          <span className="font-semibold">{e.title}</span>
          <span className="block text-xs text-ink-muted">
            {KIND_LABEL[e.kind]} · {formatDay(e.starts_on)} · in {daysUntil(e.starts_on)} days
          </span>
        </>
      ),
    },
    { key: "checked", header: "Last checked", cell: (e) => <span className="font-semibold text-warning-text">{daysSince(e.source_checked_at)} days ago</span> },
    {
      key: "source",
      header: "Source",
      cell: (e) => (
        <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[32px] items-center gap-1 font-semibold text-primary hover:underline">
          Open source <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ),
    },
    {
      key: "act",
      header: "Action",
      cell: (e) => (
        <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setAction({ type: "recheck", event: e })}>
          I checked it<span className="sr-only">: {e.title}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/exam-dates" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All exam dates
        </Link>
        <h1 className="text-2xl font-extrabold">Dates that need a check</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Open each source, make sure the date is still right, then press &quot;I checked it&quot;. If it changed, go to the exam and use Correct instead.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="text-sm font-semibold">
          Last checked more than
          <select value={older} onChange={(e) => setOlder(Number(e.target.value))} className="ml-2 min-h-[44px] rounded-lg border border-line bg-white px-3 font-normal">
            {OLDER.map((n) => (
              <option key={n} value={n}>
                {n} days ago
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          and starting within
          <select value={within} onChange={(e) => setWithin(Number(e.target.value))} className="ml-2 min-h-[44px] rounded-lg border border-line bg-white px-3 font-normal">
            {WITHIN.map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <DataTable
          caption="Dates that need a check"
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          empty={
            <>
              <p className="font-semibold text-ink">Everything is up to date</p>
              <p className="mt-1">No published date starting within {within} days was last checked more than {older} days ago.</p>
            </>
          }
        />
      )}
      <ActionDialog action={action} examName={action ? (names.get(action.event.exam_slug) ?? action.event.exam_slug) : ""} onClose={() => setAction(null)} />
    </div>
  );
}
