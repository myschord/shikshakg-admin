import { api, type Page } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
const e = encodeURIComponent;

export type ImportJob = S["ImportJobOut"];
export type ImportStatus = S["ImportStatus"];
export type ImportItemStatus = S["ImportItemStatus"];
export type ImportItem = {
  record_index: number;
  status: ImportItemStatus;
  external_id: string | null;
  question_id: string | null;
  error: { code?: string; message?: string; details?: unknown } | null;
  warnings: { code?: string; [k: string]: unknown }[];
};

export const IMPORT_STATUS_LABEL: Record<ImportStatus, string> = { pending: "Waiting", processing: "Importing", completed: "Finished", failed: "Stopped" };
export const ITEM_STATUS_LABEL: Record<ImportItemStatus, string> = { pending: "Waiting", created: "Added", updated: "Updated", unchanged: "Already there", failed: "Failed" };

// Staff routes for question JSON files (backend phase 2a). The file is the raw request body. A record that fails
// is reported on its own; the rest still import. Uploading a file that is still importing returns that same job.
export const importsApi = {
  list: (cursor?: string) => api.get<Page<ImportJob>>("/admin/question-imports", { query: { cursor, limit: 30 } }),
  get: (id: string) => api.get<ImportJob>(`/admin/question-imports/${e(id)}`),
  items: (id: string, status?: ImportItemStatus, cursor?: string) => api.get<Page<ImportItem>>(`/admin/question-imports/${e(id)}/items`, { query: { status, cursor, limit: 50 } }),
  create: (file: Blob, filename: string, opts: { publish: boolean; createMissingTaxonomy: boolean }) =>
    api.post<ImportJob>("/admin/question-imports", file, { query: { filename, publish: opts.publish, create_missing_taxonomy: opts.createMissingTaxonomy } }),
  resume: (id: string) => api.post<ImportJob>(`/admin/question-imports/${e(id)}/resume`),
};

/** What a records file looks like. Used for the sample download and the in-page help. */
export const SAMPLE_IMPORT = [
  {
    question_id: "sample-0001",
    content: {
      question: "Which article of the Constitution abolishes untouchability?",
      options: { A: "Article 14", B: "Article 17", C: "Article 21", D: "Article 32" },
      answer: "B",
      explanation: "Article 17 abolishes untouchability and forbids its practice in any form.",
    },
    metadata: {
      source_type: "ADMIN_CREATED",
      exam_id: "ssc-cgl",
      exam_stage: "tier-1",
      subject_id: "indian-polity",
      topic_id: "fundamental-rights",
      language: "en",
      difficulty: "easy",
      question_type: "direct_fact",
    },
  },
];

export type FileCheck = { ok: boolean; count?: number; message?: string };

/** Quick look at a chosen file before it is uploaded: is it JSON, and is it a list of records? */
export async function checkImportFile(file: File): Promise<FileCheck> {
  if (file.size === 0) return { ok: false, message: "That file is empty." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, message: "That file is larger than 25 MB. Split it into smaller files." };
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch (err) {
    return { ok: false, message: `That is not valid JSON (${err instanceof Error ? err.message : "parse error"}).` };
  }
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { questions?: unknown }).questions) ? (data as { questions: unknown[] }).questions : null;
  if (!list) return { ok: false, message: "The file must be a list of questions, or an object with a \"questions\" list." };
  if (list.length === 0) return { ok: false, message: "The file has no questions in it." };
  const bad = list.findIndex((r) => !r || typeof r !== "object" || !("content" in r) || !("metadata" in r));
  if (bad >= 0) return { ok: false, message: `Record ${bad + 1} has no "content" or no "metadata". Each record needs both.` };
  return { ok: true, count: list.length };
}
