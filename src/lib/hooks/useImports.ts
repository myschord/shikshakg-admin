"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { importsApi, type ImportItemStatus, type ImportJob } from "@/lib/api/imports";
import { pdfApi, type PdfDocument, type PdfReviewStatus, type PdfQuestionUpdate, type UploadOptions } from "@/lib/api/pdf";

const active = (j: Pick<ImportJob, "status">) => j.status === "pending" || j.status === "processing";
const reading = (d: Pick<PdfDocument, "status">) => d.status === "uploaded" || d.status === "processing";

export const useImportJobs = () =>
  useInfiniteQuery({
    queryKey: ["imports", "list"],
    queryFn: ({ pageParam }) => importsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    // Keep checking while anything is still importing.
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some(active)) ? 3000 : false),
    staleTime: 5000,
  });

export const useImportJob = (id: string | null) =>
  useQuery({ queryKey: ["imports", "one", id], queryFn: () => importsApi.get(id as string), enabled: !!id, refetchInterval: (q) => (q.state.data && active(q.state.data) ? 2000 : false), staleTime: 2000 });

export const useImportItems = (id: string | null, status?: ImportItemStatus) =>
  useInfiniteQuery({
    queryKey: ["imports", "items", id, status ?? "all"],
    queryFn: ({ pageParam }) => importsApi.items(id as string, status, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    enabled: !!id,
    staleTime: 5000,
  });

export function useImportMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["imports"] });
  return {
    create: useMutation({ mutationFn: (v: { file: File; publish: boolean; createMissingTaxonomy: boolean }) => importsApi.create(v.file, v.file.name, { publish: v.publish, createMissingTaxonomy: v.createMissingTaxonomy }), onSuccess: refresh }),
    resume: useMutation({ mutationFn: (id: string) => importsApi.resume(id), onSuccess: refresh }),
  };
}

export const usePdfDocuments = () =>
  useInfiniteQuery({
    queryKey: ["pdf", "list"],
    queryFn: ({ pageParam }) => pdfApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    refetchInterval: (q) => (q.state.data?.pages.some((p) => p.items.some(reading)) ? 4000 : false),
    staleTime: 5000,
  });

export const usePdfDocument = (id: string | null) =>
  useQuery({ queryKey: ["pdf", "one", id], queryFn: () => pdfApi.get(id as string), enabled: !!id, refetchInterval: (q) => (q.state.data && reading(q.state.data) ? 3000 : false), staleTime: 3000 });

export const usePdfQuestions = (id: string | null, status?: PdfReviewStatus, issue?: string) =>
  useInfiniteQuery({
    queryKey: ["pdf", "questions", id, status ?? "all", issue ?? "any"],
    queryFn: ({ pageParam }) => pdfApi.questions(id as string, { status, issue, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    enabled: !!id,
    staleTime: 5000,
  });

export const usePageImage = (id: string | null, page: number | null) =>
  useQuery({ queryKey: ["pdf", "page", id, page], queryFn: () => pdfApi.pageImage(id as string, page as number), enabled: !!id && !!page, staleTime: 30 * 60_000, gcTime: 30 * 60_000 });

export function usePdfMutations(documentId?: string | null) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["pdf"] });
  return {
    upload: useMutation({ mutationFn: (v: { file: File; options: UploadOptions }) => pdfApi.upload(v.file, v.file.name, v.options), onSuccess: refresh }),
    resume: useMutation({ mutationFn: (id: string) => pdfApi.resume(id), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: { id: string; body: PdfQuestionUpdate }) => pdfApi.update(v.id, v.body), onSuccess: refresh }),
    review: useMutation({ mutationFn: (v: { id: string; status: PdfReviewStatus; note?: string | null }) => pdfApi.review(v.id, v.status, v.note), onSuccess: refresh }),
    approveAll: useMutation({ mutationFn: () => pdfApi.approveAll(documentId as string), onSuccess: refresh }),
    importApproved: useMutation({
      mutationFn: () => pdfApi.importApproved(documentId as string),
      onSuccess: () => Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["imports"] }), qc.invalidateQueries({ queryKey: ["questions"] })]),
    }),
    resolveSources: useMutation({ mutationFn: () => pdfApi.resolveSources(documentId as string), onSuccess: refresh }),
  };
}
