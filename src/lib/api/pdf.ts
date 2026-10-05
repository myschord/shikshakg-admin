import { api, type Page } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
const e = encodeURIComponent;

export type PdfDocument = S["DocumentOut"];
export type PdfDocumentDetail = S["DocumentDetailOut"];
export type DocumentStatus = S["DocumentStatus"];
export type DocumentMode = S["DocumentMode"];
export type PdfQuestion = S["PdfQuestionOut"];
export type PdfQuestionUpdate = S["PdfQuestionUpdateIn"];
export type PdfReviewStatus = S["ReviewStatus"];
export type PdfPage = { page_no: number; kind: string; layout_source: string | null; question_count: number; width_pt: number | null; height_pt: number | null };
/** A box in PDF points. The page origin is the bottom-left corner, so `top` is larger than `bottom`. */
export type PdfBox = { page: number; x0: number; x1: number; top: number; bottom: number };

export const DOC_STATUS_LABEL: Record<DocumentStatus, string> = { uploaded: "Waiting", processing: "Reading the PDF", extracted: "Ready to review", failed: "Stopped" };

/** What each automatic check means, in words an editor can act on. `blocking` ones stop a question being approved. */
export const ISSUES: Record<string, { label: string; help: string; blocking: boolean }> = {
  stem_missing: { label: "Question text missing", help: "No question text was read. Type it in from the page image.", blocking: true },
  options_missing: { label: "An option is missing", help: "One of A to D is empty. Fill it in from the page image.", blocking: true },
  answer_missing: { label: "No answer", help: "No answer key was found. Choose the correct option.", blocking: true },
  answer_disputed: { label: "Answer in doubt", help: "The key in the PDF and the AI solver disagree. Check the answer yourself before approving.", blocking: false },
  source_missing: { label: "Source missing", help: "This question has no exam and date citation. Set the exam, stage and date below.", blocking: true },
  source_exam_unknown: { label: "Exam not recognised", help: "The exam named on the source did not match one of ours. Choose the exam, or add an alias under Pools and aliases.", blocking: true },
  source_stage_unknown: { label: "Stage needed", help: "This exam has several stages and the source did not say which. Choose the stage.", blocking: true },
  topic_missing: { label: "No topic", help: "Choose a topic so students can find it. It can be added later, but it must be set before publishing.", blocking: false },
  text_corrected: { label: "Text was corrected", help: "AI help corrected some words that the scan read badly. Compare with the page image.", blocking: false },
  assist_unavailable: { label: "AI help was not available", help: "The automatic check could not run for this question. Read it carefully.", blocking: false },
};

export type UploadOptions = {
  subject: string;
  mode: DocumentMode;
  language: "hi" | "en";
  assist: boolean;
  pageFrom?: number | null;
  pageTo?: number | null;
  exam?: string | null;
  stage?: string | null;
  paperCode?: string | null;
  examDate?: string | null;
  paperTitle?: string | null;
};

// Staff routes for PDF extraction (backend phase 5). Upload sends the PDF as the raw body; a worker reads it in
// the background. Nothing reaches the question bank until a person approves it and presses Import.
export const pdfApi = {
  upload: (file: Blob, filename: string, o: UploadOptions) =>
    api.post<PdfDocument>("/admin/pdf-documents", file, {
      query: { subject: o.subject, filename, mode: o.mode, language: o.language, assist: o.assist, page_from: o.pageFrom, page_to: o.pageTo, exam: o.exam, stage: o.stage, paper_code: o.paperCode, exam_date: o.examDate, paper_title: o.paperTitle },
    }),
  list: (cursor?: string) => api.get<Page<PdfDocument>>("/admin/pdf-documents", { query: { cursor, limit: 30 } }),
  get: (id: string) => api.get<PdfDocumentDetail>(`/admin/pdf-documents/${e(id)}`),
  resume: (id: string) => api.post<PdfDocument>(`/admin/pdf-documents/${e(id)}/resume`),
  /** The page as a PNG, fetched with the staff token and turned into a local address for an <img>. */
  pageImage: async (id: string, page: number) => URL.createObjectURL((await api.blob(`/admin/pdf-documents/${e(id)}/pages/${page}/image`)).blob),
  questions: (id: string, p: { status?: PdfReviewStatus; issue?: string; cursor?: string } = {}) =>
    api.get<Page<PdfQuestion>>(`/admin/pdf-documents/${e(id)}/questions`, { query: { status: p.status, issue: p.issue, cursor: p.cursor, limit: 100 } }),
  update: (qid: string, body: PdfQuestionUpdate) => api.patch<PdfQuestion>(`/admin/pdf-questions/${e(qid)}`, body),
  review: (qid: string, status: PdfReviewStatus, note?: string | null) => api.post<PdfQuestion>(`/admin/pdf-questions/${e(qid)}/review`, { status, note: note || null }),
  approveAll: (id: string) => api.post<S["ApproveAllOut"]>(`/admin/pdf-documents/${e(id)}/approve-all`),
  importApproved: (id: string) => api.post<S["ImportStartedOut"]>(`/admin/pdf-documents/${e(id)}/import`),
  resolveSources: (id: string) => api.post<Record<string, number>>(`/admin/pdf-documents/${e(id)}/resolve-sources`),
};
