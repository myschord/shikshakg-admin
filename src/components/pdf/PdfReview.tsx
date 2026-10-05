"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Keyboard, RotateCw } from "lucide-react";
import { toast } from "react-toastify";
import { docTone } from "@/components/pdf/PdfScreen";
import PageViewer from "@/components/pdf/PageViewer";
import QuestionForm from "@/components/pdf/QuestionForm";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import ErrorState from "@/components/kit/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { DOC_STATUS_LABEL, ISSUES, type PdfPage, type PdfReviewStatus } from "@/lib/api/pdf";
import { usePdfDocument, usePdfMutations, usePdfQuestions } from "@/lib/hooks/useImports";

const STATUS_TABS: { id: PdfReviewStatus; label: string }[] = [
  { id: "pending", label: "To review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/** The hardest screen: the original page beside the extracted question, with every uncertainty spelled out. */
export default function PdfReview() {
  const id = useSearchParams().get("id");
  const doc = usePdfDocument(id);
  const m = usePdfMutations(id);
  const [status, setStatus] = useState<PdfReviewStatus>("pending");
  const [issue, setIssue] = useState("");
  const list = usePdfQuestions(id, status, issue || undefined);
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "reject">("view");
  const [dialog, setDialog] = useState<"approveAll" | "import" | null>(null);
  const [imported, setImported] = useState<{ job: string | null; n: number } | null>(null);
  const [help, setHelp] = useState(false);
  const [announce, setAnnounce] = useState("");
  const noteRef = useRef<HTMLInputElement>(null);

  const index = Math.max(0, items.findIndex((i) => i.id === selected));
  const current = items[index] ?? null;

  const go = useCallback(
    (to: number) => {
      const t = items[Math.min(items.length - 1, Math.max(0, to))];
      if (t) setSelected(t.id);
    },
    [items]
  );

  // After a decision, the list refetches and the decided question leaves the "To review" tab, so staying at the same
  // position shows the next one. Say so for screen readers.
  const decided = useCallback(() => {
    setAnnounce(`Done. ${Math.max(0, items.length - 1)} left in this list.`);
    setSelected(items[index + 1]?.id ?? items[index - 1]?.id ?? null);
    setMode("view");
  }, [items, index]);

  // Keep the list topped up while reviewing.
  useEffect(() => {
    if (items.length - index < 5 && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [items.length, index, list]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !typing(e.target)) return setHelp((h) => !h);
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || !current) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowRight") go(index + 1);
      else if (k === "k" || e.key === "ArrowLeft") go(index - 1);
      else if (k === "x" && status === "pending") {
        setMode("reject");
        e.preventDefault();
      } else if (k === "a" && status === "pending") (document.getElementById("pdf-approve") as HTMLButtonElement | null)?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, go, index, status]);

  useEffect(() => {
    if (mode === "reject") noteRef.current?.focus();
  }, [mode]);

  if (!id) return <p className="text-sm">No document selected. <Link href="/pdf" className="font-semibold text-primary underline">Back to PDF extraction</Link></p>;
  if (doc.isPending) return <Skeleton className="mx-auto h-64 max-w-6xl" />;
  if (doc.isError) return <div className="mx-auto max-w-6xl"><ErrorState error={doc.error} onRetry={() => doc.refetch()} /></div>;
  const d = doc.data;
  const counts = d.review_counts as Record<string, number>;
  const issueCounts = ((d.stats as { issues?: Record<string, number> })?.issues ?? {}) as Record<string, number>;
  const pages = d.pages as PdfPage[];
  const approved = counts.approved ?? 0;
  const pending = counts.pending ?? 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div>
        <Link href="/pdf" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All PDFs
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold">{d.filename}</h1>
          <Badge tone={docTone(d.status)}>{DOC_STATUS_LABEL[d.status]}</Badge>
          <span className="text-sm text-ink-muted">
            {d.mode === "compilation" ? "Compilation" : "Single paper"} · {d.page_count ?? "?"} pages
          </span>
        </div>
      </div>

      {d.status === "uploaded" || d.status === "processing" ? (
        <div role="status" className="rounded-2xl border border-line bg-white p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden />
          <p className="mt-3 font-semibold">{d.status === "uploaded" ? "Waiting for a reader to pick this up…" : "Reading the pages and finding the questions…"}</p>
          <p className="mt-1 text-sm text-ink-muted">A long book can take several minutes. You can leave this page and come back; it keeps going.</p>
        </div>
      ) : d.status === "failed" ? (
        <div className="space-y-3 rounded-2xl border border-error/25 bg-error/5 p-5">
          <p className="font-semibold text-error-text">Reading stopped: {(d.error as { message?: string } | null)?.message ?? "an error occurred"}.</p>
          <Button
            variant="secondary"
            loading={m.resume.isPending}
            icon={<RotateCw className="h-4 w-4" aria-hidden />}
            onClick={async () => {
              try {
                await m.resume.mutateAsync(d.id);
                toast.success("Reading restarted.");
              } catch {}
            }}
          >
            Try again from where it stopped
          </Button>
          {m.resume.error ? <ErrorState compact error={m.resume.error} /> : null}
        </div>
      ) : (
        <>
          <section aria-label="Document summary" className="space-y-3 rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="tabular-nums">
                <strong className="text-lg">{pending}</strong> to review
              </span>
              <span className="tabular-nums">
                <strong className="text-lg text-success-text">{approved}</strong> approved
              </span>
              <span className="tabular-nums">
                <strong className="text-lg">{counts.rejected ?? 0}</strong> rejected
              </span>
              <Button variant="ghost" className="ml-auto !min-h-[36px]" onClick={() => setHelp((h) => !h)} aria-expanded={help} icon={<Keyboard className="h-4 w-4" aria-hidden />}>
                Shortcuts
              </Button>
            </div>
            {help && (
              <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2" aria-label="Keyboard shortcuts">
                {[
                  ["A", "Approve (when not typing in a field)"],
                  ["Ctrl + Enter", "Save and approve, from inside any field"],
                  ["X", "Reject with a note"],
                  ["J or →", "Next question"],
                  ["K or ←", "Previous question"],
                  ["?", "Show or hide this list"],
                ].map(([k, t]) => (
                  <div key={k} className="flex items-center gap-3">
                    <dt>
                      <kbd className="rounded border border-line bg-bg-tint px-2 py-0.5 font-mono text-xs font-bold">{k}</kbd>
                    </dt>
                    <dd>{t}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setDialog("approveAll")} disabled={pending === 0}>
                Approve every question with no problems
              </Button>
              {d.mode === "compilation" && (
                <Button
                  variant="secondary"
                  loading={m.resolveSources.isPending}
                  onClick={async () => {
                    try {
                      const r = await m.resolveSources.mutateAsync();
                      toast.success(`Sources checked again${r && Object.keys(r).length ? `: ${Object.entries(r).map(([k, v]) => `${v} ${k}`).join(", ")}` : ""}.`);
                    } catch {}
                  }}
                >
                  Look up sources again
                </Button>
              )}
              <Button onClick={() => setDialog("import")} disabled={approved === 0}>
                Import {approved} approved question{approved === 1 ? "" : "s"}
              </Button>
            </div>
            {m.resolveSources.error ? <ErrorState compact error={m.resolveSources.error} /> : null}
            {imported && (
              <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm font-semibold text-success-text">
                Import started for {imported.n} question{imported.n === 1 ? "" : "s"}. They appear in the review queue when it finishes, usually within seconds.{" "}
                {imported.job && (
                  <Link href={`/imports/view?id=${imported.job}`} className="underline">
                    Follow the import
                  </Link>
                )}{" "}
                ·{" "}
                <Link href="/questions/review" className="underline">
                  Open the review queue
                </Link>
              </p>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Show" className="flex gap-2">
              {STATUS_TABS.map((t) => (
                <button key={t.id} type="button" aria-pressed={status === t.id} onClick={() => { setStatus(t.id); setSelected(null); }} className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${status === t.id ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-muted hover:border-primary"}`}>
                  {t.label} ({counts[t.id] ?? 0})
                </button>
              ))}
            </div>
            <label className="text-sm font-semibold">
              With this problem
              <select value={issue} onChange={(e) => { setIssue(e.target.value); setSelected(null); }} className="ml-2 min-h-[44px] rounded-lg border border-line bg-white px-3 font-normal">
                <option value="">Any</option>
                {Object.entries(issueCounts).map(([k, n]) => (
                  <option key={k} value={k}>
                    {ISSUES[k]?.label ?? k} ({n})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {announce}
          </p>

          {list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : list.isPending ? (
            <Skeleton className="h-96" />
          ) : !current ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-10 text-center">
              <p className="font-semibold">{status === "pending" ? (issue ? "Nothing with that problem is waiting." : "Everything has been decided.") : "Nothing here."}</p>
              {status === "pending" && approved > 0 && <p className="mt-1 text-sm text-ink-muted">Press &quot;Import {approved} approved&quot; above to send the approved questions to the review queue.</p>}
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="lg:sticky lg:top-4 lg:self-start">
                <PageViewer documentId={d.id} question={current} pages={pages} />
              </div>
              <div className="min-w-0 space-y-3">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous question" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white hover:border-primary disabled:opacity-40">
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Jump to a question</span>
                    <select value={current.id} onChange={(e) => setSelected(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-line bg-white px-3 text-sm">
                      {items.map((i, n) => (
                        <option key={i.id} value={i.id}>
                          {n + 1}. Q{i.number} · {(i.stem ?? "").replace(/\s+/g, " ").slice(0, 50) || "(no text)"}
                          {i.issues.length ? ` · ${i.issues.length} issue${i.issues.length === 1 ? "" : "s"}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => go(index + 1)} disabled={index >= items.length - 1 && !list.hasNextPage} aria-label="Next question" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white hover:border-primary disabled:opacity-40">
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <p className="text-xs text-ink-muted">
                  {index + 1} of {items.length}
                  {list.hasNextPage ? "+" : ""} in this list
                </p>
                <div
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && status === "pending") {
                      e.preventDefault();
                      (document.getElementById("pdf-approve") as HTMLButtonElement | null)?.click();
                    }
                  }}
                >
                  <QuestionForm key={`${current.id}:${current.version}`} question={current} documentId={d.id} onDecided={decided} noteRef={noteRef} mode={mode} setMode={setMode} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={dialog === "approveAll"}
        title="Approve every question with no problems?"
        confirmLabel="Approve them"
        busy={m.approveAll.isPending}
        error={m.approveAll.error}
        onCancel={() => {
          m.approveAll.reset();
          setDialog(null);
        }}
        onConfirm={async () => {
          try {
            const r = await m.approveAll.mutateAsync();
            toast.success(`${r.approved} approved. ${r.still_pending} still need you.`);
            setDialog(null);
          } catch {}
        }}
      >
        <p>Every waiting question that has no &quot;Must fix&quot; problem is approved at once. Questions with problems stay for you to check by hand.</p>
        <p>Approving does not publish anything. Approved questions go to the review queue only when you press Import.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "import"}
        title={`Import ${approved} approved question${approved === 1 ? "" : "s"}?`}
        confirmLabel="Import"
        busy={m.importApproved.isPending}
        error={m.importApproved.error}
        onCancel={() => {
          m.importApproved.reset();
          setDialog(null);
        }}
        onConfirm={async () => {
          try {
            const r = await m.importApproved.mutateAsync();
            setImported({ job: r.import_job_id, n: r.questions });
            setDialog(null);
            toast.success(r.questions ? `Import started for ${r.questions} question${r.questions === 1 ? "" : "s"}.` : "Nothing new to import.");
          } catch {}
        }}
      >
        <p>The approved questions are added to the question bank as drafts waiting for review. Students cannot see them yet.</p>
        <p>A question already imported from this document is not added twice.</p>
      </ConfirmDialog>
    </div>
  );
}
