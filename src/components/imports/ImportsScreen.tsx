"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Download, FileUp } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { checkImportFile, IMPORT_STATUS_LABEL, SAMPLE_IMPORT, type FileCheck, type ImportJob } from "@/lib/api/imports";
import { checkedLabel } from "@/lib/date";
import { useImportJobs, useImportMutations } from "@/lib/hooks/useImports";

export const statusTone = (s: string) => (s === "completed" ? "success" : s === "failed" ? "danger" : "warning") as "success" | "danger" | "warning";

export default function ImportsScreen() {
  const jobs = useImportJobs();
  const { create } = useImportMutations();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<FileCheck | null>(null);
  const [publish, setPublish] = useState(false);
  const [taxonomy, setTaxonomy] = useState(false);

  const rows = jobs.data?.pages.flatMap((p) => p.items) ?? [];

  async function pick(f: File | null) {
    setFile(f);
    setCheck(f ? await checkImportFile(f) : null);
    create.reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !check?.ok) return;
    try {
      const job = await create.mutateAsync({ file, publish, createMissingTaxonomy: taxonomy });
      toast.success(job.deduplicated ? "That file is already importing. Showing its progress." : "Upload received. The import has started.");
      setFile(null);
      setCheck(null);
      if (input.current) input.current.value = "";
    } catch {
      // shown below
    }
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(SAMPLE_IMPORT, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-questions.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<ImportJob>[] = [
    {
      key: "file",
      header: "File",
      cell: (j) => (
        <Link href={`/imports/view?id=${j.id}`} className="font-semibold text-primary hover:underline">
          {j.filename}
        </Link>
      ),
    },
    { key: "status", header: "State", cell: (j) => <Badge tone={statusTone(j.status)}>{IMPORT_STATUS_LABEL[j.status]}</Badge> },
    {
      key: "progress",
      header: "Records",
      cell: (j) => (
        <span className="whitespace-nowrap tabular-nums">
          {j.processed_records} of {j.total_records}
        </span>
      ),
    },
    { key: "ok", header: "Added / updated", align: "right", cell: (j) => `${j.created_count} / ${j.updated_count}` },
    { key: "same", header: "Unchanged", align: "right", cell: (j) => j.unchanged_count },
    { key: "bad", header: "Failed", align: "right", cell: (j) => (j.failed_count > 0 ? <span className="font-semibold text-error-text">{j.failed_count}</span> : "0") },
    { key: "when", header: "Uploaded", cell: (j) => <span className="whitespace-nowrap text-xs text-ink-muted">{checkedLabel(j.created_at)}</span> },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">JSON imports</h1>
        <p className="mt-1 text-sm text-ink-muted">Add many questions at once from a JSON file. A record that fails is reported on its own; the rest still go in. Imported questions wait in the review queue unless you choose to publish them.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-5" noValidate>
        <h2 className="text-lg font-bold">Upload a file</h2>
        <Field label="Questions file" required error={check && !check.ok ? check.message : null} help="A JSON file: a list of questions, or an object with a &quot;questions&quot; list. Up to 25 MB.">
          {(p) => <input {...p} ref={input} type="file" accept="application/json,.json" onChange={(e) => pick(e.target.files?.[0] ?? null)} className={`${inputClass} py-2`} />}
        </Field>
        {check?.ok && (
          <p role="status" className="text-sm font-semibold text-success-text">
            {check.count} question{check.count === 1 ? "" : "s"} found in this file.
          </p>
        )}
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold">Options</legend>
          <label className="flex min-h-[44px] items-start gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <span>
              Publish the questions straight away
              <span className="block text-xs text-ink-muted">Leave this off unless the file was already reviewed. Otherwise they go to the review queue first.</span>
            </span>
          </label>
          <label className="flex min-h-[44px] items-start gap-2 text-sm">
            <input type="checkbox" checked={taxonomy} onChange={(e) => setTaxonomy(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
            <span>
              Create subjects and topics the file mentions that do not exist yet
              <span className="block text-xs text-ink-muted">Leave this off to catch typos in subject and topic codes: such records fail instead of creating new ones.</span>
            </span>
          </label>
        </fieldset>
        {create.error ? <ErrorState compact error={create.error} /> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!file || !check?.ok} loading={create.isPending} icon={<FileUp className="h-4 w-4" aria-hidden />}>
            Import
          </Button>
          <Button variant="secondary" onClick={downloadSample} icon={<Download className="h-4 w-4" aria-hidden />}>
            Download a sample file
          </Button>
        </div>
        <details className="text-sm">
          <summary className="min-h-[44px] cursor-pointer py-3 font-semibold text-primary">What goes in each record?</summary>
          <div className="space-y-2 pb-2 text-ink-muted">
            <p>
              Each record has <code className="rounded bg-bg-tint px-1">question_id</code> (any unique text, so re-uploading is safe), <code className="rounded bg-bg-tint px-1">content</code> (the question,
              options A to D or more, the answer, an optional explanation) and <code className="rounded bg-bg-tint px-1">metadata</code> (source type, exam, stage, subject, topic, language, difficulty).
            </p>
            <p>A previous-year question also needs its paper code, year and question number. Download the sample file to see every field.</p>
          </div>
        </details>
      </form>

      <section aria-labelledby="past">
        <h2 id="past" className="mb-3 text-lg font-bold">
          Earlier imports
        </h2>
        {jobs.isError ? (
          <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
        ) : (
          <DataTable caption="Imports" columns={columns} rows={rows} rowKey={(j) => j.id} loading={jobs.isPending} empty="No files imported yet." />
        )}
        {jobs.hasNextPage && (
          <div className="mt-3 text-center">
            <Button variant="secondary" onClick={() => jobs.fetchNextPage()} loading={jobs.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
