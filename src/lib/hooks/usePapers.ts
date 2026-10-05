"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { papersApi, testsApi, type PaperCreate, type PaperUpdate, type SeriesCreate, type SeriesUpdate, type TestFromPaper, type TestUpdate } from "@/lib/api/papers";

export const usePapers = (exam: string | null) =>
  useInfiniteQuery({
    queryKey: ["papers", "list", exam],
    queryFn: ({ pageParam }) => papersApi.list(exam as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    enabled: !!exam,
    staleTime: 10_000,
  });

export const useSeries = (exam?: string) => useQuery({ queryKey: ["series", exam ?? "all"], queryFn: () => testsApi.series(exam), staleTime: 15_000 });

export const useTests = (p: { exam?: string; seriesId?: string; status?: string }) =>
  useInfiniteQuery({
    queryKey: ["tests", "list", p],
    queryFn: ({ pageParam }) => testsApi.list({ ...p, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    staleTime: 10_000,
  });

export const useTest = (id: string | null) => useQuery({ queryKey: ["tests", "one", id], queryFn: () => testsApi.get(id as string), enabled: !!id, staleTime: 5_000 });

export function usePaperMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["papers"] });
  return {
    create: useMutation({ mutationFn: (b: PaperCreate) => papersApi.create(b), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: { code: string; body: PaperUpdate }) => papersApi.update(v.code, v.body), onSuccess: refresh }),
    publish: useMutation({ mutationFn: (code: string) => papersApi.publish(code), onSuccess: refresh }),
    unpublish: useMutation({ mutationFn: (code: string) => papersApi.unpublish(code), onSuccess: refresh }),
  };
}

export function useTestMutations() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["tests"] }), qc.invalidateQueries({ queryKey: ["series"] }), qc.invalidateQueries({ queryKey: ["papers"] })]);
  return {
    createSeries: useMutation({ mutationFn: (b: SeriesCreate) => testsApi.createSeries(b), onSuccess: refresh }),
    updateSeries: useMutation({ mutationFn: (v: { id: string; body: SeriesUpdate }) => testsApi.updateSeries(v.id, v.body), onSuccess: refresh }),
    fromPaper: useMutation({ mutationFn: (b: TestFromPaper) => testsApi.fromPaper(b), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: { id: string; body: TestUpdate }) => testsApi.update(v.id, v.body), onSuccess: refresh }),
    publish: useMutation({ mutationFn: (id: string) => testsApi.publish(id), onSuccess: refresh }),
    archive: useMutation({ mutationFn: (id: string) => testsApi.archive(id), onSuccess: refresh }),
    newVersion: useMutation({ mutationFn: (id: string) => testsApi.newVersion(id), onSuccess: refresh }),
    replaceQuestion: useMutation({ mutationFn: (v: { id: string; position: number; questionId: string }) => testsApi.replaceQuestion(v.id, v.position, v.questionId), onSuccess: refresh }),
  };
}
