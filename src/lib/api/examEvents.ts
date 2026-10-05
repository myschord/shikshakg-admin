import { api } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
const e = encodeURIComponent;

export type AdminEvent = S["AdminEventOut"];
export type EventFields = S["EventFields"];
export type EventCreate = S["EventCreate"];
export type EventKind = S["EventKind"];
export type EventStatus = S["EventStatus"];
export type Certainty = S["Certainty"];

export const KIND_LABEL: Record<EventKind, string> = {
  notification: "Notification published",
  application_open: "Applications open",
  application_close: "Applications close",
  admit_card: "Admit card",
  exam_date: "Exam date",
  answer_key: "Answer key",
  result: "Result",
};
export const KINDS = Object.keys(KIND_LABEL) as EventKind[];
export const CERTAINTY_LABEL: Record<Certainty, string> = { tentative: "Tentative (expected)", confirmed: "Confirmed", cancelled: "Cancelled" };

// Staff routes for exam dates (backend phase 11). A published date is never edited in place: it is corrected
// with `revise`, which makes a draft that replaces it when published.
export const examEventsApi = {
  list: (examSlug: string, status?: EventStatus) => api.get<AdminEvent[]>(`/admin/exams/${e(examSlug)}/events`, { query: { status } }),
  stale: (olderThanDays: number, withinDays: number) => api.get<AdminEvent[]>("/admin/exam-events/stale", { query: { older_than_days: olderThanDays, within_days: withinDays } }),
  create: (examSlug: string, body: EventCreate) => api.post<AdminEvent>(`/admin/exams/${e(examSlug)}/events`, body),
  updateDraft: (id: string, body: EventFields) => api.put<AdminEvent>(`/admin/exam-events/${e(id)}`, body),
  revise: (id: string, body: EventFields) => api.post<AdminEvent>(`/admin/exam-events/${e(id)}/revise`, body),
  publish: (id: string) => api.post<AdminEvent>(`/admin/exam-events/${e(id)}/publish`),
  retire: (id: string) => api.post<AdminEvent>(`/admin/exam-events/${e(id)}/retire`),
  recheck: (id: string) => api.post<AdminEvent>(`/admin/exam-events/${e(id)}/recheck`),
};
