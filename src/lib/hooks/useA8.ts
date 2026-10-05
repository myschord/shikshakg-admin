"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { announcementsApi, currentAffairsAdminApi, dailyQuizAdminApi, logApi, usersApi, type AnnouncementInput, type CaInput, type CaStatus, type Role } from "@/lib/api/a8";

export const useUsers = (p: { q?: string; role?: string }) => useQuery({ queryKey: ["a8", "users", p], queryFn: () => usersApi.list(p), staleTime: 5_000 });
export const useEntityTypes = () => useQuery({ queryKey: ["a8", "entity-types"], queryFn: logApi.entityTypes, staleTime: 60_000 });
export const useLog = (p: { actor?: string; action?: string; entityType?: string }) => useQuery({ queryKey: ["a8", "log", p], queryFn: () => logApi.list(p), staleTime: 5_000 });
export const useAnnouncements = (status?: string) => useQuery({ queryKey: ["a8", "announcements", status ?? "all"], queryFn: () => announcementsApi.list(status || undefined), staleTime: 5_000 });
export const useCaItems = (p: { exam?: string; status?: string }) => useQuery({ queryKey: ["a8", "ca", p], queryFn: () => currentAffairsAdminApi.list(p), staleTime: 5_000 });
export const useQuizDays = (exam: string | null, from: string, to: string) => useQuery({ queryKey: ["a8", "quiz", exam, from, to], queryFn: () => dailyQuizAdminApi.list(exam as string, from, to), enabled: !!exam, staleTime: 5_000 });

/** Every write can change the action log too, so the whole A8 cache is refreshed. */
function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["a8"] });
}

export function useUserMutations() {
  const refresh = useRefresh();
  return {
    setRole: useMutation({ mutationFn: (v: { id: string; role: Role; reason: string }) => usersApi.setRole(v.id, v.role, v.reason), onSuccess: refresh }),
    setStatus: useMutation({ mutationFn: (v: { id: string; status: "active" | "suspended"; reason: string }) => usersApi.setStatus(v.id, v.status, v.reason), onSuccess: refresh }),
    invite: useMutation({ mutationFn: (b: Parameters<typeof usersApi.inviteStaff>[0]) => usersApi.inviteStaff(b), onSuccess: refresh }),
  };
}

export function useAnnouncementMutations() {
  const refresh = useRefresh();
  return {
    create: useMutation({ mutationFn: (b: AnnouncementInput) => announcementsApi.create(b), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: { id: string; body: AnnouncementInput }) => announcementsApi.update(v.id, v.body), onSuccess: refresh }),
    sendNow: useMutation({ mutationFn: (id: string) => announcementsApi.sendNow(id), onSuccess: refresh }),
    cancel: useMutation({ mutationFn: (id: string) => announcementsApi.cancel(id), onSuccess: refresh }),
  };
}

export function useCaMutations() {
  const refresh = useRefresh();
  return {
    create: useMutation({ mutationFn: (b: CaInput) => currentAffairsAdminApi.create(b), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: { id: string; body: CaInput }) => currentAffairsAdminApi.update(v.id, v.body), onSuccess: refresh }),
    setStatus: useMutation({ mutationFn: (v: { id: string; status: CaStatus; note?: string }) => currentAffairsAdminApi.setStatus(v.id, v.status, v.note), onSuccess: refresh }),
  };
}

export function useQuizMutations(exam: string | null) {
  const refresh = useRefresh();
  return {
    set: useMutation({ mutationFn: (v: { date: string; test: { id: string; title: string } }) => dailyQuizAdminApi.set(exam as string, v.date, v.test), onSuccess: refresh }),
    clear: useMutation({ mutationFn: (date: string) => dailyQuizAdminApi.clear(exam as string, date), onSuccess: refresh }),
  };
}
