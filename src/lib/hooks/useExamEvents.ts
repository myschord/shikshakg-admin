"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "@/lib/api/catalog";
import { examEventsApi, type EventCreate, type EventFields, type EventStatus } from "@/lib/api/examEvents";

export const useCategories = () => useQuery({ queryKey: ["catalog", "categories"], queryFn: catalogApi.categories, staleTime: 10 * 60_000 });

export const useExam = (slug: string | null) =>
  useQuery({ queryKey: ["catalog", "exam", slug], queryFn: () => catalogApi.exam(slug as string), enabled: !!slug, staleTime: 10 * 60_000 });

export const useEvents = (slug: string | null, status?: EventStatus) =>
  useQuery({ queryKey: ["events", slug, status ?? "all"], queryFn: () => examEventsApi.list(slug as string, status), enabled: !!slug, staleTime: 10_000 });

export const useStale = (olderThanDays: number, withinDays: number) =>
  useQuery({ queryKey: ["events", "stale", olderThanDays, withinDays], queryFn: () => examEventsApi.stale(olderThanDays, withinDays), staleTime: 30_000 });

/** Every change to a date can change both the list and the stale queue, so both are refreshed. */
function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["events"] });
}

export function useEventMutations(examSlug: string | null) {
  const refresh = useRefresh();
  const opts = { onSuccess: refresh };
  return {
    create: useMutation({ mutationFn: (b: EventCreate) => examEventsApi.create(examSlug as string, b), ...opts }),
    updateDraft: useMutation({ mutationFn: (v: { id: string; body: EventFields }) => examEventsApi.updateDraft(v.id, v.body), ...opts }),
    revise: useMutation({ mutationFn: (v: { id: string; body: EventFields }) => examEventsApi.revise(v.id, v.body), ...opts }),
    publish: useMutation({ mutationFn: (id: string) => examEventsApi.publish(id), ...opts }),
    retire: useMutation({ mutationFn: (id: string) => examEventsApi.retire(id), ...opts }),
    recheck: useMutation({ mutationFn: (id: string) => examEventsApi.recheck(id), ...opts }),
  };
}
