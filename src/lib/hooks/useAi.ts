"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiApi, type PolicyValues } from "@/lib/api/ai";

export const usePolicy = () => useQuery({ queryKey: ["ai", "policy"], queryFn: aiApi.policy, staleTime: 10_000 });
export const useSuspicious = (limit: number) => useQuery({ queryKey: ["ai", "suspicious", limit], queryFn: () => aiApi.suspicious(limit), staleTime: 30_000 });

export function usePublishPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { values: PolicyValues; note: string | null }) => aiApi.publish(v.values, v.note),
    onSuccess: (p) => qc.setQueryData(["ai", "policy"], p),
  });
}
