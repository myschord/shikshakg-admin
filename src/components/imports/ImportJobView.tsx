"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, RotateCw } from "lucide-react";
import { toast } from "react-toastify";
import { statusTone } from "@/components/imports/ImportsScreen";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ErrorState from "@/components/kit/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { IMPORT_STATUS_LABEL, ITEM_STATUS_LABEL, type ImportItem, type ImportItemStatus } from "@/lib/api/imports";
import { checkedLabel } from "@/lib/date";
import { useImportItems, useImportJob, useImportMutations } from "@/lib/hooks/useImports";

const FILTERS: { id: ImportItemStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "failed", label: "Failed" },
  { id: "created", label: "Added" },
  { id: "updated", label: "Updated" },
  { id: "unchanged", label: "Already there" },
];

/** A plain-words reading of the backend's error codes, so an editor knows what to fix in the file. */
const FIX: Record<string, string> = {
  invalid_record: "A required field is missing or has a wrong value. The details below say which.",
  pyq_fields_missing: "A previous-year question needs its paper code, year and question number.",
  question_id_required: "Add a question_id to this record so that uploading the file again is safe.",
  unsupported_source_type: "AI-generated questions cannot be imported. Use ADMIN_CREATED or PYQ.",
  subject_not_found: "The subject code does not exist. Check the spelling, or re-import with \"create missing subjects and topics\" on.",
  topic_not_found: "The topic code does not exist for that subject. Check the spelling, or re-import with \"create missing subjects and topics\" on.",
  exam_not_found: "The exam code does not exist. Use the exam's short code, for example ssc-cgl.",
  invalid_answer: "The answer must be an option letter such as B.",
  invalid_options: "Options must be non-empty text with letters A, B, C and D (or more) and no repeats.",
  year_date_mismatch: "The year does not match the paper date.",
  duplicate: "This record clashes with a question that already exists.",
};

function detailLines(details: unknown): string[] {
  if (Array.isArray(details)) return details.map((d) => (d && typeof d === "object" && "message" in d ? `${(d as { loc?: string[] }).loc?.join(".") ?? ""}: ${(d as { message: string }).message}` : JSON.stringify(d)));
  if (details && typeof details === "object") return Object.entries(details as Record<string, unknown>).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  return [];
}

export default function ImportJobView() {
  const id = useSearchParams().get("id");
  const job = useImportJob(id);
  const [filter, setFilter] = useState<ImportItemStatus | "all">("failed");
  const items = useImportItems(id, filter === "all" ? undefined : filter);
  const { resume } = useImportMutations();
  const rows = useMemo(() => items.data?.pages.flatMap((p) => p.items) ?? [], [items.data]);

  if (!id) return <p className="text-sm">No import selected. <Link href="/imports" className="font-semibold text-primary underline">Back to imports</Link></p>;
  if (job.isPending) return <Skeleton className="mx-auto h-64 max-w-5xl" />;
  if (job.isError) return <div className="mx-auto max-w-5xl"><ErrorState error={job.error} onRetry={() => job.refetch()} /></div>;
  const j = job.data;
  const pct = j.total_records ? Math.round((j.processed_records / j.total_records) * 100) : 0;
  const canResume = j.status === "failed" || j.status === "pending";

  const columns: Column<ImportItem>[] = [
    { key: "n", header: "Record", align: "right", cell: (i) => i.record_index + 1 },
    { key: "id", header: "Question id", cell: (i) => <span className="font-mono text-xs">{i.external_id ?? "(none)"}</span> },
    { key: "st", header: "Result", cell: (i) => <Badge tone={i.status === "failed" ? "danger" : i.status === "pending" ? "warning" : "success"}>{ITEM_STATUS_LABEL[i.status]}</Badge> },
    {
      key: "why",
      header: "What happened",
      className: "max-w-lg",
      cell: (i) => (
        <>
          {i.error && (
            <>
              <span className="font-semibold text-error-text">{i.error.message ?? i.error.code}</span>
              {i.error.code && FIX[i.error.code] && <span className="mt-0.5 block text-xs">{FIX[i.error.code]}</span>}
              {detailLines(i.error.details).length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-ink-muted">
                  {detailLines(i.error.details).slice(0, 6).map((l, k) => (
                    <li key={k}>{l}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {i.warnings.length > 0 && <span className="mt-1 block text-xs text-warning-text">Warning: {i.warnings.map((w) => w.code).join(", ")}</span>}
          {i.question_id && (
            <Link href={`/questions/view?id=${i.question_id}`} className="text-xs font-semibold text-primary hover:underline">
              Open the question
            </Link>
          )}
        </>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/imports" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All imports
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{j.filename}</h1>
          <Badge tone={statusTone(j.status)}>{IMPORT_STATUS_LABEL[j.status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Uploaded {checkedLabel(j.created_at)}. {j.options && (j.options as { publish?: boolean }).publish ? "Questions were published as they were added." : "Added questions are waiting in the review queue."}
        </p>
      </div>

      <section aria-label="Progress" className="space-y-3 rounded-2xl border border-line bg-white p-5">
        <div role="progressbar" aria-label="Import progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-3 overflow-hidden rounded-full bg-border-tint">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p role="status" className="text-sm font-semibold tabular-nums">
          {j.processed_records} of {j.total_records} records done{j.status === "processing" ? "…" : ""}
        </p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Added", j.created_count],
            ["Updated", j.updated_count],
            ["Already there", j.unchanged_count],
            ["Failed", j.failed_count],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</dt>
              <dd className={`text-2xl font-extrabold tabular-nums ${k === "Failed" && (v as number) > 0 ? "text-error-text" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
        {j.error ? <p className="rounded-lg bg-error/5 px-3 py-2 text-sm text-error-text">The import stopped: {(j.error as { message?: string }).message ?? JSON.stringify(j.error)}</p> : null}
        {canResume && (
          <Button
            variant="secondary"
            loading={resume.isPending}
            icon={<RotateCw className="h-4 w-4" aria-hidden />}
            onClick={async () => {
              try {
                await resume.mutateAsync(j.id);
                toast.success("Picked up again from where it stopped.");
              } catch {}
            }}
          >
            Resume the import
          </Button>
        )}
        {resume.error ? <ErrorState compact error={resume.error} /> : null}
        {j.failed_count === 0 && j.status === "completed" && j.created_count + j.updated_count > 0 && (
          <Link href="/questions/review" className="inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
            Open the review queue
          </Link>
        )}
      </section>

      <section aria-labelledby="items-h" className="space-y-3">
        <h2 id="items-h" className="text-lg font-bold">
          Record by record
        </h2>
        <div role="group" aria-label="Filter records" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${filter === f.id ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-muted hover:border-primary"}`}>
              {f.label}
            </button>
          ))}
        </div>
        {items.isError ? (
          <ErrorState error={items.error} onRetry={() => items.refetch()} />
        ) : (
          <DataTable caption="Import records" columns={columns} rows={rows} rowKey={(i) => String(i.record_index)} loading={items.isPending} empty={filter === "failed" ? "No record failed." : "No records here."} />
        )}
        {items.hasNextPage && (
          <div className="text-center">
            <Button variant="secondary" onClick={() => items.fetchNextPage()} loading={items.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
