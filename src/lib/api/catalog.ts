import { api } from "./client";
import type { components } from "./schema";

type S = components["schemas"];

export type ExamCategory = S["CategoryOut"];
export type Exam = S["ExamOut"];
export type ExamStage = S["StageOut"];

// Public catalog reads, used for the exam and stage pickers.
export const catalogApi = {
  categories: () => api.get<ExamCategory[]>("/exam-categories", { auth: "none", cache: "no-cache" }),
  exam: (slug: string) => api.get<Exam>(`/exams/${encodeURIComponent(slug)}`, { auth: "none", cache: "no-cache" }),
};

export type Syllabus = S["SyllabusOut"];
export const syllabusApi = {
  /** Subjects, topics and subtopics for one exam stage. A multi-stage exam needs the stage. */
  get: (slug: string, stage?: string | null) => api.get<Syllabus>(`/exams/${encodeURIComponent(slug)}/syllabus`, { query: { stage: stage ?? undefined }, auth: "none", cache: "no-cache" }),
};
