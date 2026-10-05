"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ErrorState from "@/components/kit/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PdfBox, PdfPage, PdfQuestion } from "@/lib/api/pdf";
import { usePageImage } from "@/lib/hooks/useImports";

/**
 * The original page, with the selected question outlined. Boxes arrive in PDF points (measured down from the top),
 * so they are placed as percentages of the page size and stay correct at any width.
 */
export default function PageViewer({ documentId, question, pages }: { documentId: string; question: PdfQuestion | null; pages: PdfPage[] }) {
  const boxes = (question?.boxes ?? []) as PdfBox[];
  const spanned = [...new Set(boxes.map((b) => b.page))].sort((a, b) => a - b);
  const first = question?.first_page ?? spanned[0] ?? 1;
  const [page, setPage] = useState(first);
  // A new question brings its own page into view.
  useEffect(() => setPage(first), [first, question?.id]);

  const img = usePageImage(documentId, page);
  const dims = pages.find((p) => p.page_no === page);
  const here = boxes.filter((b) => b.page === page);
  const total = pages.length || null;

  return (
    <section aria-label="Original page" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Page {page}
          {total ? ` of ${total}` : ""}
          {spanned.length > 1 && <span className="ml-2 text-xs font-normal text-ink-muted">This question runs over pages {spanned.join(", ")}.</span>}
        </p>
        <div className="flex gap-1">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white hover:border-primary disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setPage((p) => (total ? Math.min(total, p + 1) : p + 1))} disabled={!!total && page >= total} aria-label="Next page" className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-white hover:border-primary disabled:opacity-40">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="max-h-[78vh] overflow-auto rounded-xl border border-line bg-white" tabIndex={0} role="region" aria-label={`Page ${page} image`}>
        {img.isPending ? (
          <Skeleton className="h-[60vh]" />
        ) : img.isError ? (
          <div className="p-3">
            <ErrorState compact error={img.error} onRetry={() => img.refetch()} />
          </div>
        ) : (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.data} alt={`Scan of page ${page}`} className="block w-full" />
            {dims?.width_pt && dims.height_pt
              ? here.map((b, i) => (
                  <div
                    key={i}
                    data-testid="question-box"
                    aria-hidden
                    className="pointer-events-none absolute rounded border-2 border-primary bg-primary/10"
                    style={{ left: `${(b.x0 / dims.width_pt!) * 100}%`, width: `${((b.x1 - b.x0) / dims.width_pt!) * 100}%`, top: `${((dims.height_pt! - b.top) / dims.height_pt!) * 100}%`, height: `${((b.top - b.bottom) / dims.height_pt!) * 100}%` }}
                  />
                ))
              : null}
          </div>
        )}
      </div>
    </section>
  );
}
