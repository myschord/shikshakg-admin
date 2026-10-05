import { api, type Page } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
const e = encodeURIComponent;

export type Paper = S["PaperAdminOut"];
export type PaperCreate = S["PaperCreateIn"];
export type PaperUpdate = S["PaperUpdateIn"];
export type Series = S["SeriesAdminOut"];
export type SeriesCreate = S["SeriesCreateIn"];
export type SeriesUpdate = S["SeriesUpdateIn"];
export type AdminTest = S["TestAdminOut"];
export type TestFromPaper = S["TestFromPaperIn"];
export type TestUpdate = S["TestUpdateIn"];
export type TestStatus = S["TestStatus"];

export const TEST_STATUS_LABEL: Record<string, string> = { draft: "Draft", generating: "Being prepared", ready: "Ready", published: "Published", archived: "Archived", failed: "Failed" };
export const SERIES_STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", archived: "Archived" };

// Staff routes for papers, test series and tests (backend phase 5). A paper is a set of past-paper questions; a test
// is built from a paper's published questions. A test freezes at its first attempt: after that, changing its
// questions means a new version, and publishing the new version archives the old one.
export const papersApi = {
  list: (exam: string, cursor?: string) => api.get<Page<Paper>>("/admin/papers", { query: { exam, cursor, limit: 100 } }),
  get: (code: string) => api.get<Paper>(`/admin/papers/${e(code)}`),
  create: (body: PaperCreate) => api.post<Paper>("/admin/papers", body),
  update: (code: string, body: PaperUpdate) => api.patch<Paper>(`/admin/papers/${e(code)}`, body),
  publish: (code: string) => api.post<Paper>(`/admin/papers/${e(code)}/publish`),
  unpublish: (code: string) => api.post<Paper>(`/admin/papers/${e(code)}/unpublish`),
};

export const testsApi = {
  series: (exam?: string) => api.get<Series[]>("/admin/test-series", { query: { exam } }),
  createSeries: (body: SeriesCreate) => api.post<Series>("/admin/test-series", body),
  updateSeries: (id: string, body: SeriesUpdate) => api.patch<Series>(`/admin/test-series/${e(id)}`, body),
  list: (p: { exam?: string; seriesId?: string; status?: string; cursor?: string } = {}) =>
    api.get<Page<AdminTest>>("/admin/tests", { query: { exam: p.exam, series_id: p.seriesId, status: p.status, cursor: p.cursor, limit: 50 } }),
  get: (id: string) => api.get<AdminTest>(`/admin/tests/${e(id)}`),
  fromPaper: (body: TestFromPaper) => api.post<AdminTest>("/admin/tests/from-paper", body),
  update: (id: string, body: TestUpdate) => api.patch<AdminTest>(`/admin/tests/${e(id)}`, body),
  publish: (id: string) => api.post<AdminTest>(`/admin/tests/${e(id)}/publish`),
  archive: (id: string) => api.post<AdminTest>(`/admin/tests/${e(id)}/archive`),
  newVersion: (id: string) => api.post<AdminTest>(`/admin/tests/${e(id)}/new-version`),
  replaceQuestion: (id: string, position: number, questionId: string) => api.put<AdminTest>(`/admin/tests/${e(id)}/questions/${position}`, { question_id: questionId }),
};
