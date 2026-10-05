import { api, type Page } from "./client";

// Staff screens added in console phase A8, now on the real backend routes (backend phases 15 to 19). The routes and
// their rules are written up in docs/BACKEND_NEEDS.md.
const e = encodeURIComponent;

// ── users and roles ────────────────────────────────────────────────────────────────────────────
export type Role = "student" | "content_editor" | "admin";
/** `active` and `suspended` are the only states staff can move an account between; the other two are shown, not set. */
export type UserStatus = "active" | "suspended" | "pending_verification" | "anonymized";
export type UserRow = { id: string; email: string; full_name: string; role: Role; status: UserStatus; email_verified: boolean; created_at: string; last_login_at: string | null };
export const ROLE_LABEL: Record<Role, string> = { student: "Student", content_editor: "Content editor", admin: "Administrator" };
export const USER_STATUS_LABEL: Record<UserStatus, string> = { active: "Active", suspended: "Suspended", pending_verification: "Not activated yet", anonymized: "Anonymised" };

export const usersApi = {
  list: (p: { q?: string; role?: string; status?: string; cursor?: string } = {}): Promise<Page<UserRow>> => api.get<Page<UserRow>>("/admin/users", { query: { q: p.q, role: p.role, status: p.status, cursor: p.cursor, limit: 50 } }),
  setRole: (id: string, role: Role, reason: string): Promise<UserRow> => api.post<UserRow>(`/admin/users/${e(id)}/role`, { role, reason }),
  setStatus: (id: string, status: "active" | "suspended", reason: string): Promise<UserRow> => api.post<UserRow>(`/admin/users/${e(id)}/status`, { status, reason }),
  inviteStaff: (b: { email: string; full_name: string; role: "content_editor" | "admin" }): Promise<UserRow> => api.post<UserRow>("/admin/staff", b),
};

// ── staff action log ───────────────────────────────────────────────────────────────────────────
/** `actor_email` is null for something an operator did from the command line. */
export type LogEntry = { id: string; at: string; actor_email: string | null; action: string; entity_type: string; entity_id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
export const logApi = {
  list: (p: { actor?: string; action?: string; entityType?: string; cursor?: string } = {}): Promise<Page<LogEntry>> =>
    api.get<Page<LogEntry>>("/admin/action-log", { query: { actor_email: p.actor, action_prefix: p.action, entity_type: p.entityType, cursor: p.cursor, limit: 50 } }),
  /** The kinds of record that really appear in the log, so the filter never offers one that is not there. */
  entityTypes: (): Promise<string[]> => api.get<string[]>("/admin/action-log/entity-types"),
};

// ── announcements ──────────────────────────────────────────────────────────────────────────────
export type AnnouncementStatus = "draft" | "scheduled" | "sent" | "cancelled";
export type Announcement = {
  id: string;
  title: string;
  body: string;
  deep_link: string | null;
  /** exam_slug null means every student. */
  exam_slug: string | null;
  send_push: boolean;
  status: AnnouncementStatus;
  send_at: string | null;
  sent_at: string | null;
  recipients: number | null;
  read_count: number | null;
  created_at: string;
};
export type AnnouncementInput = { title: string; body: string; deep_link: string | null; exam_slug: string | null; send_push: boolean; send_at: string | null };
export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = { draft: "Draft", scheduled: "Scheduled", sent: "Sent", cancelled: "Cancelled" };
export const announcementsApi = {
  list: (status?: string): Promise<Page<Announcement>> => api.get<Page<Announcement>>("/admin/announcements", { query: { status, limit: 50 } }),
  create: (b: AnnouncementInput): Promise<Announcement> => api.post<Announcement>("/admin/announcements", b),
  update: (id: string, b: AnnouncementInput): Promise<Announcement> => api.patch<Announcement>(`/admin/announcements/${e(id)}`, b),
  sendNow: (id: string): Promise<Announcement> => api.post<Announcement>(`/admin/announcements/${e(id)}/send`),
  cancel: (id: string): Promise<Announcement> => api.post<Announcement>(`/admin/announcements/${e(id)}/cancel`),
};

// ── current affairs ────────────────────────────────────────────────────────────────────────────
export type CaStatus = "draft" | "in_review" | "published" | "retired";
/** 3 matters most. */
export type Importance = 1 | 2 | 3;
export type CaTranslation = { language: "en" | "hi"; headline: string; summary: string };
export type CaItem = {
  id: string;
  /** One item can be for several exams. */
  exam_slugs: string[];
  importance: Importance;
  topic: { id: string; name: string } | null;
  source_name: string;
  source_url: string;
  published_on: string;
  status: CaStatus;
  /** English is always there; Hindi is optional. */
  translations: CaTranslation[];
  created_by: string | null;
  published_at: string | null;
  updated_at: string;
};
export type CaInput = { exam_slugs: string[]; importance: Importance; topic_id: string | null; source_name: string; source_url: string; published_on: string; translations: CaTranslation[] };
export const CA_STATUS_LABEL: Record<CaStatus, string> = { draft: "Draft", in_review: "In review", published: "Published", retired: "Retired" };
export const IMPORTANCE_LABEL: Record<Importance, string> = { 1: "Good to know", 2: "Important", 3: "Must know" };
/** Where each state may go. The server enforces the same table; only administrators may publish or retire. */
export const CA_MOVES: Record<CaStatus, CaStatus[]> = { draft: ["in_review"], in_review: ["published", "draft"], published: ["retired"], retired: ["draft"] };
/** The English text of an item, which every item has. */
export const caText = (item: CaItem): CaTranslation => item.translations.find((t) => t.language === "en") ?? item.translations[0];
export const currentAffairsAdminApi = {
  list: (p: { exam?: string; status?: string } = {}): Promise<Page<CaItem>> => api.get<Page<CaItem>>("/admin/current-affairs", { query: { exam_slug: p.exam, status: p.status, limit: 50 } }),
  create: (b: CaInput): Promise<CaItem> => api.post<CaItem>("/admin/current-affairs", b),
  update: (id: string, b: CaInput): Promise<CaItem> => api.patch<CaItem>(`/admin/current-affairs/${e(id)}`, b),
  setStatus: (id: string, status: CaStatus, note?: string): Promise<CaItem> => api.post<CaItem>(`/admin/current-affairs/${e(id)}/status`, { status, note: note ?? null }),
};

// ── daily quiz schedule ────────────────────────────────────────────────────────────────────────
export type QuizDay = { date: string; test_id: string; test_title: string; test_status?: string };
export const dailyQuizAdminApi = {
  list: (exam: string, from: string, to: string): Promise<QuizDay[]> => api.get<QuizDay[]>(`/admin/exams/${e(exam)}/daily-quizzes`, { query: { from, to } }),
  set: (exam: string, date: string, test: { id: string; title: string }): Promise<QuizDay> => api.put<QuizDay>(`/admin/exams/${e(exam)}/daily-quizzes/${e(date)}`, { test_id: test.id }),
  clear: (exam: string, date: string): Promise<void> => api.delete<void>(`/admin/exams/${e(exam)}/daily-quizzes/${e(date)}`),
};
