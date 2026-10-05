import { api, type Page } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
const e = encodeURIComponent;

export type Product = S["ProductAdminOut"];
export type ProductCreate = S["ProductCreateIn"];
export type ProductUpdate = S["ProductUpdateIn"];
export type PriceCreate = S["PriceCreateIn"];
export type Order = S["OrderAdminOut"];
export type Refund = S["RefundAdminOut"];
export type Entitlement = S["EntitlementAdminOut"];
export type ProductType = ProductCreate["product_type"];

export const PRODUCT_TYPES: { v: ProductType; label: string; help: string }[] = [
  { v: "COURSE", label: "Course", help: "Unlocks the video courses of the exam." },
  { v: "TEST_SERIES", label: "Test series", help: "Unlocks the paid test series of the exam." },
  { v: "COMBO", label: "Course and test series", help: "Unlocks both." },
];
export const PRODUCT_STATUS_LABEL: Record<string, string> = { draft: "Draft", active: "On sale", retired: "Retired" };
export const ORDER_STATUS_LABEL: Record<string, string> = { created: "Created", pending_payment: "Waiting for payment", paid: "Paid", failed: "Failed", cancelled: "Cancelled", expired: "Expired", refunded: "Refunded", partially_refunded: "Partly refunded" };
export const REFUND_STATUS_LABEL: Record<string, string> = { requested: "Waiting for a decision", processing: "Being sent", processed: "Refunded", failed: "Failed" };
export const ENTITLEMENT_LABEL: Record<string, string> = { COURSE_ACCESS: "Courses", TEST_SERIES_ACCESS: "Test series" };
export const GRANT_SOURCE_LABEL: Record<string, string> = { purchase: "Bought", admin_grant: "Given by staff", trial: "Trial" };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
/** A rupee amount as the server sends it (a decimal string) shown as ₹1,499.00. */
export const rupees = (v: string | number | null | undefined): string => (v == null || v === "" || Number.isNaN(Number(v)) ? "" : inr.format(Number(v)));

// Staff routes for commerce (backend phase 6). The screens are for the admin role. A price is never edited: a new
// price closes the current one. A refund that is processed goes back to the student's card through Razorpay.
export const commerceApi = {
  products: (p: { exam?: string; status?: string; cursor?: string } = {}) => api.get<Page<Product>>("/admin/products", { query: { exam: p.exam, status: p.status, cursor: p.cursor, limit: 50 } }),
  createProduct: (body: ProductCreate) => api.post<Product>("/admin/products", body),
  updateProduct: (code: string, body: ProductUpdate) => api.patch<Product>(`/admin/products/${e(code)}`, body),
  setPrice: (code: string, body: PriceCreate) => api.post<Product>(`/admin/products/${e(code)}/prices`, body),
  orders: (p: { email?: string; status?: string; cursor?: string } = {}) => api.get<Page<Order>>("/admin/orders", { query: { user_email: p.email, status: p.status, cursor: p.cursor, limit: 50 } }),
  order: (id: string) => api.get<Order>(`/admin/orders/${e(id)}`),
  refunds: (p: { status?: string; cursor?: string } = {}) => api.get<Page<Refund>>("/admin/refunds", { query: { status: p.status, cursor: p.cursor, limit: 50 } }),
  processRefund: (id: string, body: { amount?: string | null; note?: string | null }) => api.post<Refund>(`/admin/refunds/${e(id)}/process`, body),
  rejectRefund: (id: string, note: string) => api.post<Refund>(`/admin/refunds/${e(id)}/reject`, { note }),
  entitlements: (p: { email?: string; exam?: string; cursor?: string } = {}) => api.get<Page<Entitlement>>("/admin/entitlements", { query: { user_email: p.email, exam: p.exam, cursor: p.cursor, limit: 50 } }),
  grant: (body: { user_email: string; product_code: string; validity_days?: number | null; reason: string }) => api.post<Entitlement[]>("/admin/entitlements/grant", body),
  revoke: (id: string, reason: string) => api.post<Entitlement>(`/admin/entitlements/${e(id)}/revoke`, { reason }),
};
