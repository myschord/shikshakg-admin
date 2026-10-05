"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commerceApi, type PriceCreate, type ProductCreate, type ProductUpdate } from "@/lib/api/commerce";

const paged = <T extends { has_more: boolean; next_cursor: string | null }>(last: T) => (last.has_more ? (last.next_cursor ?? undefined) : undefined);

export const useProducts = (p: { exam?: string; status?: string }) =>
  useInfiniteQuery({ queryKey: ["commerce", "products", p], queryFn: ({ pageParam }) => commerceApi.products({ ...p, cursor: pageParam }), initialPageParam: undefined as string | undefined, getNextPageParam: paged, staleTime: 10_000 });

export const useOrders = (p: { email?: string; status?: string }) =>
  useInfiniteQuery({ queryKey: ["commerce", "orders", p], queryFn: ({ pageParam }) => commerceApi.orders({ ...p, cursor: pageParam }), initialPageParam: undefined as string | undefined, getNextPageParam: paged, staleTime: 10_000 });

export const useOrder = (id: string | null) => useQuery({ queryKey: ["commerce", "order", id], queryFn: () => commerceApi.order(id as string), enabled: !!id, staleTime: 10_000 });

export const useRefunds = (status: string) =>
  useInfiniteQuery({ queryKey: ["commerce", "refunds", status], queryFn: ({ pageParam }) => commerceApi.refunds({ status, cursor: pageParam }), initialPageParam: undefined as string | undefined, getNextPageParam: paged, staleTime: 5_000 });

export const useEntitlements = (p: { email?: string; exam?: string }) =>
  useInfiniteQuery({ queryKey: ["commerce", "entitlements", p], queryFn: ({ pageParam }) => commerceApi.entitlements({ ...p, cursor: pageParam }), initialPageParam: undefined as string | undefined, getNextPageParam: paged, staleTime: 5_000 });

export function useCommerceMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["commerce"] });
  return {
    createProduct: useMutation({ mutationFn: (b: ProductCreate) => commerceApi.createProduct(b), onSuccess: refresh }),
    updateProduct: useMutation({ mutationFn: (v: { code: string; body: ProductUpdate }) => commerceApi.updateProduct(v.code, v.body), onSuccess: refresh }),
    setPrice: useMutation({ mutationFn: (v: { code: string; body: PriceCreate }) => commerceApi.setPrice(v.code, v.body), onSuccess: refresh }),
    processRefund: useMutation({ mutationFn: (v: { id: string; amount?: string | null; note?: string | null }) => commerceApi.processRefund(v.id, { amount: v.amount, note: v.note }), onSettled: refresh }),
    rejectRefund: useMutation({ mutationFn: (v: { id: string; note: string }) => commerceApi.rejectRefund(v.id, v.note), onSuccess: refresh }),
    grant: useMutation({ mutationFn: (b: Parameters<typeof commerceApi.grant>[0]) => commerceApi.grant(b), onSuccess: refresh }),
    revoke: useMutation({ mutationFn: (v: { id: string; reason: string }) => commerceApi.revoke(v.id, v.reason), onSuccess: refresh }),
  };
}
