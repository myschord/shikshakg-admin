"use client";

import Link from "next/link";
import { CalendarClock, CheckCircle2, CircleDashed, FileText, FileWarning, Flag, ListChecks, type LucideIcon } from "lucide-react";
import ErrorState from "@/components/kit/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth/AuthContext";
import { useStale } from "@/lib/hooks/useExamEvents";
import { useImportJobs, usePdfDocuments } from "@/lib/hooks/useImports";
import { useQuestionList, useReports } from "@/lib/hooks/useQuestions";

const LATER = ["Pending refunds", "Suspicious AI questions"];

/** "12" when the whole queue was loaded, "50+" when there is more than one page. */
const count = (n: number, more: boolean) => `${n}${more ? "+" : ""}`;

/** The day's work queues. Only queues whose screens exist show real counts. */
export default function TodayPage() {
  const { user } = useAuth();
  const stale = useStale(30, 60);
  const review = useQuestionList({ status: "in_review" });
  const reports = useReports("open");
  const pdfs = usePdfDocuments();
  const imports = useImportJobs();
  const pdfPending = (pdfs.data?.pages[0]?.items ?? []).reduce((n, d) => n + (d.status === "extracted" ? ((d.review_counts as Record<string, number>).pending ?? 0) : 0), 0);
  const failedImports = (imports.data?.pages[0]?.items ?? []).filter((j) => j.status === "failed" || j.failed_count > 0).length;
  const first = user?.full_name.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Today{first ? `, ${first}` : ""}</h1>
        <p className="mt-1 text-sm text-ink-muted">What needs a person today.</p>
      </div>

      <section aria-labelledby="queues" className="grid gap-4 sm:grid-cols-2">
        <h2 id="queues" className="sr-only">
          Work queues
        </h2>
        <article className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-border-tint text-primary-dark">
              <CalendarClock className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold">Exam dates to recheck</h3>
              {stale.isPending ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : stale.isError ? (
                <div className="mt-2">
                  <ErrorState compact error={stale.error} onRetry={() => stale.refetch()} />
                </div>
              ) : (
                <>
                  <p className="mt-1 text-3xl font-extrabold tabular-nums">{stale.data.length}</p>
                  <p className="text-sm text-ink-muted">
                    {stale.data.length === 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-success-text" aria-hidden /> Everything starting soon was checked recently.
                      </span>
                    ) : (
                      "Published dates starting within 60 days, last checked over 30 days ago."
                    )}
                  </p>
                  <Link href="/exam-dates/stale" className="mt-3 inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
                    Open the queue
                  </Link>
                </>
              )}
            </div>
          </div>
        </article>


        <Queue
          icon={ListChecks}
          title="Questions waiting for review"
          href="/questions/review"
          cta="Open the review queue"
          q={review}
          n={review.data ? count(review.data.pages.flatMap((x) => x.items).length, !!review.hasNextPage) : ""}
          done="Nothing is waiting for review."
          empty={review.data?.pages[0]?.items.length === 0}
          blurb="Imported and AI-drafted questions that must be approved before students see them."
        />
        <Queue
          icon={Flag}
          title="Open student reports"
          href="/reports"
          cta="Open the reports"
          q={reports}
          n={reports.data ? count(reports.data.pages.flatMap((x) => x.items).length, !!reports.data.pages.at(-1)?.has_more) : ""}
          done="No question is currently flagged."
          empty={reports.data?.pages[0]?.items.length === 0}
          blurb="Reports students filed on questions. Each one is a possible mistake in front of learners."
        />
        <Queue
          icon={FileText}
          title="PDF questions to check"
          href="/pdf"
          cta="Open PDF extraction"
          q={pdfs}
          n={String(pdfPending)}
          done="No extracted question is waiting for you."
          empty={pdfPending === 0}
          blurb="Questions read from uploaded PDFs that you have not approved or rejected yet."
        />
        <Queue
          icon={FileWarning}
          title="Imports with failures"
          href="/imports"
          cta="Open JSON imports"
          q={imports}
          n={String(failedImports)}
          done="No recent import had a failed record."
          empty={failedImports === 0}
          blurb="Recent import files where some records failed or the import stopped."
        />
        <article className="rounded-2xl border border-dashed border-line bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/5 text-ink-muted">
              <CircleDashed className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h3 className="font-bold">More queues are coming</h3>
              <p className="mt-1 text-sm text-ink-muted">These appear here as their screens are built:</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
                {LATER.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function Queue({ icon: Icon, title, href, cta, q, n, done, empty, blurb }: { icon: LucideIcon; title: string; href: string; cta: string; q: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }; n: string; done: string; empty: boolean; blurb: string }) {
  return (
    <article className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-border-tint text-primary-dark">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">{title}</h3>
          {q.isPending ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : q.isError ? (
            <div className="mt-2">
              <ErrorState compact error={q.error} onRetry={() => q.refetch()} />
            </div>
          ) : (
            <>
              <p className="mt-1 text-3xl font-extrabold tabular-nums">{empty ? 0 : n}</p>
              <p className="text-sm text-ink-muted">
                {empty ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-success-text" aria-hidden /> {done}
                  </span>
                ) : (
                  blurb
                )}
              </p>
              <Link href={href} className="mt-3 inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
                {cta}
              </Link>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
