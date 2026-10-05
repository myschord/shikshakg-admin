import { api, type Page } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
const e = encodeURIComponent;

export type AdminQuestion = S["QuestionAdminOut"];
/** One row of the list route: a preview and codes, not the full question (that comes from `get`). */
export type QuestionListItem = {
  id: string;
  status: QuestionStatus;
  source_type: string;
  exam_slug: string;
  paper_code: string | null;
  question_number: number | null;
  year: number | null;
  subject_slug: string;
  topic_slug: string | null;
  difficulty: string;
  languages: string[];
  preview: string;
  report_count: number;
  version: number;
  updated_at: string;
};
export type AdminTranslation = S["AdminTranslationOut"];
export type QuestionStatus = S["QuestionStatus"];
export type QuestionCreate = S["QuestionCreateIn"];
export type QuestionUpdate = S["QuestionUpdateIn"];
export type TranslationIn = S["TranslationIn"];
export type Difficulty = S["Difficulty"];
export type QuestionType = S["QuestionType"];
export type PatternKind = S["Pattern"];
export type Language = S["Language"];
export type QuestionMedia = S["MediaAdminOut"];
export type MediaPlacement = S["MediaPlacement"];
export type Report = S["ReportAdminOut"];
export type ReportStatus = S["ReportStatus"];
export type Pool = S["PoolOut"];
export type Alias = S["AliasOut"];

export const STATUS_LABEL: Record<QuestionStatus, string> = { draft: "Draft", in_review: "In review", published: "Published", rejected: "Rejected", retired: "Retired" };
export const STATUSES = Object.keys(STATUS_LABEL) as QuestionStatus[];
export const TYPE_LABEL: Record<QuestionType, string> = {
  direct_fact: "Direct fact",
  conceptual: "Conceptual",
  application: "Application",
  analytical: "Analytical",
  statement_based: "Statement based",
  assertion_reason: "Assertion and reason",
  match_the_following: "Match the following",
  chronology: "Chronology",
  numerical: "Numerical",
  passage_based: "Passage based",
  diagram_based: "Diagram based",
  other: "Other",
};
export const REASON_LABEL: Record<string, string> = {
  wrong_answer: "Wrong answer",
  wrong_question: "Wrong question",
  typo: "Typo",
  translation_issue: "Translation issue",
  missing_diagram: "Missing diagram",
  duplicate: "Duplicate",
  other: "Other",
};
export const LANG_LABEL: Record<string, string> = { hi: "Hindi", en: "English" };
export const OPTION_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];
export const PLACEMENTS: MediaPlacement[] = ["stem", ...OPTION_KEYS.slice(0, 8).map((k) => `option_${k}` as MediaPlacement), "explanation"];

export type ListParams = { exam?: string; status?: QuestionStatus; paper?: string; sourceType?: "PYQ" | "AI_GENERATED" | "ADMIN_CREATED"; cursor?: string; limit?: number };

// Staff routes for the question bank (backend phase 2a/2b). A question moves between statuses by rule; the
// backend refuses a move that is not allowed and refuses to publish an unclassified question.
export const questionsApi = {
  list: (p: ListParams = {}) =>
    api.get<Page<QuestionListItem>>("/admin/questions", { query: { exam: p.exam, status: p.status, paper: p.paper, source_type: p.sourceType, cursor: p.cursor, limit: p.limit ?? 50 } }),
  get: (id: string) => api.get<AdminQuestion>(`/admin/questions/${e(id)}`),
  create: (body: QuestionCreate) => api.post<AdminQuestion>("/admin/questions", body),
  update: (id: string, body: QuestionUpdate) => api.patch<AdminQuestion>(`/admin/questions/${e(id)}`, body),
  setStatus: (id: string, status: QuestionStatus, note?: string | null) => api.post<AdminQuestion>(`/admin/questions/${e(id)}/status`, { status, note: note || null }),
  bulkStatus: (ids: string[], status: QuestionStatus, note?: string | null) => api.post<S["BulkStatusOut"]>("/admin/questions/bulk-status", { ids, status, note: note || null }),

  media: (id: string) => api.get<QuestionMedia[]>(`/admin/questions/${e(id)}/media`),
  addMedia: (id: string, file: File, placement: MediaPlacement, altText: string, position: number) =>
    api.post<QuestionMedia>(`/admin/questions/${e(id)}/media`, file, { query: { placement, alt_text: altText || undefined, position } }),
  deleteMedia: (id: string, mediaId: string) => api.delete(`/admin/questions/${e(id)}/media/${e(mediaId)}`),

  reports: (status: ReportStatus, cursor?: string) => api.get<Page<Report>>("/admin/question-reports", { query: { status, cursor, limit: 100 } }),
  resolveReport: (id: string, status: "resolved" | "dismissed", note?: string | null) => api.post<Report>(`/admin/question-reports/${e(id)}/resolve`, { status, note: note || null }),

  pools: () => api.get<Pool[]>("/admin/pyq-pools"),
  createPool: (body: S["PoolCreateIn"]) => api.post<Pool>("/admin/pyq-pools", body),
  updatePool: (slug: string, body: S["PoolUpdateIn"]) => api.patch<Pool>(`/admin/pyq-pools/${e(slug)}`, body),
  setPoolExams: (slug: string, examSlugs: string[]) => api.put<Pool>(`/admin/pyq-pools/${e(slug)}/exams`, { exam_slugs: examSlugs }),
  setPoolSubjects: (slug: string, subjectSlugs: string[]) => api.put<Pool>(`/admin/pyq-pools/${e(slug)}/subjects`, { subject_slugs: subjectSlugs }),
  aliases: () => api.get<Alias[]>("/admin/exam-source-aliases"),
  createAlias: (body: S["AliasCreateIn"]) => api.post<Alias>("/admin/exam-source-aliases", body),
  deleteAlias: (id: string) => api.delete(`/admin/exam-source-aliases/${e(id)}`),
};
