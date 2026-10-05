"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { syllabusApi } from "@/lib/api/catalog";
import { questionsApi, type ListParams, type MediaPlacement, type QuestionCreate, type QuestionStatus, type QuestionUpdate, type ReportStatus } from "@/lib/api/questions";

export function useQuestionList(p: Omit<ListParams, "cursor">, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["questions", "list", p],
    queryFn: ({ pageParam }) => questionsApi.list({ ...p, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    enabled,
    staleTime: 15_000,
  });
}

export const useQuestion = (id: string | null) => useQuery({ queryKey: ["questions", "one", id], queryFn: () => questionsApi.get(id as string), enabled: !!id, staleTime: 10_000 });

export const useQuestionMedia = (id: string | null) => useQuery({ queryKey: ["questions", "media", id], queryFn: () => questionsApi.media(id as string), enabled: !!id, staleTime: 60_000 });

/** Subjects and topics for an exam stage, for the classification pickers. */
export const useSyllabus = (exam: string | null, stage: string | null | undefined) =>
  useQuery({ queryKey: ["syllabus", exam, stage ?? null], queryFn: () => syllabusApi.get(exam as string, stage), enabled: !!exam, staleTime: 10 * 60_000, retry: false });

export const useReports = (status: ReportStatus) =>
  useInfiniteQuery({
    queryKey: ["reports", status],
    queryFn: ({ pageParam }) => questionsApi.reports(status, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    staleTime: 15_000,
  });

export const usePools = () => useQuery({ queryKey: ["pools"], queryFn: questionsApi.pools, staleTime: 30_000 });
export const useAliases = () => useQuery({ queryKey: ["aliases"], queryFn: questionsApi.aliases, staleTime: 30_000 });

/** Any change to a question can change the lists, the review queue and the report counts. */
export function useQuestionMutations() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["questions"] }), qc.invalidateQueries({ queryKey: ["reports"] })]);
  return {
    create: useMutation({ mutationFn: (b: QuestionCreate) => questionsApi.create(b), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: { id: string; body: QuestionUpdate }) => questionsApi.update(v.id, v.body), onSuccess: refresh }),
    setStatus: useMutation({ mutationFn: (v: { id: string; status: QuestionStatus; note?: string | null }) => questionsApi.setStatus(v.id, v.status, v.note), onSuccess: refresh }),
    bulk: useMutation({ mutationFn: (v: { ids: string[]; status: QuestionStatus; note?: string | null }) => questionsApi.bulkStatus(v.ids, v.status, v.note), onSuccess: refresh }),
    addMedia: useMutation({
      mutationFn: (v: { id: string; file: File; placement: MediaPlacement; alt: string; position: number }) => questionsApi.addMedia(v.id, v.file, v.placement, v.alt, v.position),
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["questions", "media", v.id] }),
    }),
    deleteMedia: useMutation({ mutationFn: (v: { id: string; mediaId: string }) => questionsApi.deleteMedia(v.id, v.mediaId), onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["questions", "media", v.id] }) }),
  };
}
