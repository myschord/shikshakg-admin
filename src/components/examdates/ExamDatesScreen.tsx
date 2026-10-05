"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, ExternalLink, History } from "lucide-react";
import { toast } from "react-toastify";
import ActionDialog, { type EventAction } from "@/components/examdates/ActionDialog";
import EventForm, { type FormMode } from "@/components/examdates/EventForm";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ErrorState from "@/components/kit/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { CERTAINTY_LABEL, KIND_LABEL, type AdminEvent, type EventStatus } from "@/lib/api/examEvents";
import { checkedLabel, formatDay } from "@/lib/date";
import { useCategories, useEvents, useExam } from "@/lib/hooks/useExamEvents";

const TABS: { id: "all" | EventStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "published", label: "Published" },
  { id: "retired", label: "Retired" },
];
const STATUS_TONE = { draft: "warning", published: "success", retired: "neutral" } as const;
const CERT_TONE = { tentative: "warning", confirmed: "success", cancelled: "danger" } as const;

/** Every date for one exam: draft, publish, correct, recheck and retire. */
export default function ExamDatesScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const categories = useCategories();
  const exams = useMemo(() => (categories.data ?? []).flatMap((c) => c.exams.map((x) => ({ slug: x.slug, name: x.short_name || x.name, category: c.name }))), [categories.data]);
  const fromUrl = params.get("exam");
  const slug = exams.some((x) => x.slug === fromUrl) ? fromUrl : (exams[0]?.slug ?? null);
  const examName = exams.find((x) => x.slug === slug)?.name ?? "";

  const exam = useExam(slug);
  const [tab, setTab] = useState<"all" | EventStatus>("all");
  const events = useEvents(slug, tab === "all" ? undefined : tab);
  const [form, setForm] = useState<{ mode: FormMode; event?: AdminEvent } | null>(null);
  const [action, setAction] = useState<EventAction>(null);

  const rows = useMemo(
    () => [...(events.data ?? [])].sort((a, b) => (a.status === b.status ? a.starts_on.localeCompare(b.starts_on) : a.status === "draft" ? -1 : b.status === "draft" ? 1 : a.status === "published" ? -1 : 1)),
    [events.data]
  );

  const columns: Column<AdminEvent>[] = [
    {
      key: "date",
      header: "Date (IST)",
      cell: (e) => (
        <span className="whitespace-nowrap font-semibold">
          {formatDay(e.starts_on)}
          {e.ends_on && <span className="block text-xs font-normal text-ink-muted">to {formatDay(e.ends_on)}</span>}
        </span>
      ),
    },
    {
      key: "what",
      header: "What",
      cell: (e) => (
        <>
          <span className="font-semibold">{e.title}</span>
          <span className="block text-xs text-ink-muted">
            {KIND_LABEL[e.kind]}
            {e.stage_slug ? ` · ${exam.data?.stages.find((s) => s.slug === e.stage_slug)?.name ?? e.stage_slug}` : " · Whole exam"}
          </span>
          {e.supersedes_id && <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-dark"><History className="h-3 w-3" aria-hidden /> Replaces an earlier date</span>}
          {e.note && <span className="mt-1 block text-xs italic text-ink-muted">Note: {e.note}</span>}
        </>
      ),
    },
    { key: "certainty", header: "Certainty", cell: (e) => <Badge tone={CERT_TONE[e.certainty]}>{CERTAINTY_LABEL[e.certainty].split(" (")[0]}</Badge> },
    {
      key: "source",
      header: "Source",
      cell: (e) => (
        <>
          <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[32px] items-center gap-1 font-semibold text-primary hover:underline">
            Open source <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <span className="block text-xs text-ink-muted">Checked {checkedLabel(e.source_checked_at)}</span>
        </>
      ),
    },
    { key: "status", header: "Status", cell: (e) => <Badge tone={STATUS_TONE[e.status]}>{e.status[0].toUpperCase() + e.status.slice(1)}</Badge> },
    {
      key: "actions",
      header: "Actions",
      cell: (e) => (
        <div className="flex flex-wrap gap-2">
          {e.status === "draft" && (
            <>
              <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setForm({ mode: "edit", event: e })}>
                Edit<span className="sr-only"> {e.title}</span>
              </Button>
              <Button className="!min-h-[36px] !px-3" onClick={() => setAction({ type: "publish", event: e })}>
                Publish<span className="sr-only"> {e.title}</span>
              </Button>
            </>
          )}
          {e.status === "published" && (
            <>
              <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setForm({ mode: "revise", event: e })}>
                Correct<span className="sr-only"> {e.title}</span>
              </Button>
              <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setAction({ type: "recheck", event: e })}>
                Recheck<span className="sr-only"> {e.title}</span>
              </Button>
              <Button variant="ghost" className="!min-h-[36px] !px-3 text-error-text" onClick={() => setAction({ type: "retire", event: e })}>
                Retire<span className="sr-only"> {e.title}</span>
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Exam dates</h1>
          <p className="mt-1 text-sm text-ink-muted">Dates students see on their Dates page, Home and study plan. Every date needs an official source link.</p>
        </div>
        <Link href="/exam-dates/stale" className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
          Dates that need a check
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="exam" className="mb-1.5 block text-sm font-semibold">
            Exam
          </label>
          {categories.isPending ? (
            <Skeleton className="h-11 w-72" />
          ) : (
            <select
              id="exam"
              value={slug ?? ""}
              onChange={(e) => router.replace(`${pathname}?exam=${encodeURIComponent(e.target.value)}`, { scroll: false })}
              className="min-h-[44px] w-72 max-w-full rounded-lg border border-line bg-white px-3 text-sm"
            >
              {(categories.data ?? []).map((c) => (
                <optgroup key={c.slug} label={c.name}>
                  {c.exams.map((x) => (
                    <option key={x.slug} value={x.slug}>
                      {x.short_name || x.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
        <Button icon={<CalendarPlus className="h-4 w-4" aria-hidden />} onClick={() => setForm({ mode: "create" })} disabled={!slug || exam.isPending}>
          Add a date
        </Button>
      </div>

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${tab === t.id ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-muted hover:border-primary"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : (
        <DataTable
          caption={`Dates for ${examName}`}
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          loading={events.isPending || !slug}
          rowClassName={(e) => (e.status === "retired" ? "opacity-70" : e.status === "draft" ? "bg-warning/5" : "")}
          empty={
            <>
              <p className="font-semibold text-ink">No dates here yet</p>
              <p className="mt-1">Add the first date for {examName || "this exam"} from its official notification.</p>
            </>
          }
        />
      )}

      {slug && (
        <EventForm
          open={!!form}
          mode={form?.mode ?? "create"}
          examSlug={slug}
          examName={examName}
          stages={exam.data?.stages ?? []}
          event={form?.event}
          onClose={() => setForm(null)}
          onDone={(saved) => {
            setForm(null);
            toast.success(saved.status === "draft" ? "Saved as a draft. Students cannot see it until you publish it." : "Saved.");
          }}
        />
      )}
      <ActionDialog action={action} examName={examName} onClose={() => setAction(null)} />
    </div>
  );
}
