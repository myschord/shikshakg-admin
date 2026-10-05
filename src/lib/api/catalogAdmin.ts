import { api } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
const e = encodeURIComponent;

export type CategoryCreate = S["CategoryCreateIn"];
export type CategoryUpdate = S["CategoryUpdateIn"];
export type ExamCreate = S["ExamCreateIn"];
export type ExamUpdate = S["ExamUpdateIn"];
export type StageCreate = S["StageCreateIn"];
export type StageUpdate = S["StageUpdateIn"];
export type TaxSubject = S["TaxonomySubjectOut"];
export type TaxTopic = S["TaxonomyTopicOut"];
export type NodeCreate = S["TaxonomyNodeCreateIn"];
export type SyllabusItem = S["SyllabusItemIn"];
export type Blueprint = S["BlueprintOut"];
export type BlueprintCreate = S["BlueprintCreateIn"];
export type BlueprintSection = S["BlueprintSectionIn"];
export type Prerequisites = S["PrerequisitesOut"];

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_HELP = "Use lowercase letters, digits and single dashes, for example state-psc.";
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

// Staff routes for the catalog (backend phase 1). There is no delete route and no route that lists inactive exams,
// so nothing here removes or hides an exam. Slugs are fixed once created. A syllabus is replaced as a whole.
export const catalogAdminApi = {
  createCategory: (b: CategoryCreate) => api.post<S["CreatedOut"]>("/admin/exam-categories", b),
  updateCategory: (slug: string, b: CategoryUpdate) => api.patch<S["CreatedOut"]>(`/admin/exam-categories/${e(slug)}`, b),
  createExam: (b: ExamCreate) => api.post<S["CreatedOut"]>("/admin/exams", b),
  updateExam: (slug: string, b: ExamUpdate) => api.patch<S["CreatedOut"]>(`/admin/exams/${e(slug)}`, b),
  createStage: (exam: string, b: StageCreate) => api.post<S["CreatedOut"]>(`/admin/exams/${e(exam)}/stages`, b),
  updateStage: (exam: string, stage: string, b: StageUpdate) => api.patch<S["CreatedOut"]>(`/admin/exams/${e(exam)}/stages/${e(stage)}`, b),

  taxonomy: () => api.get<TaxSubject[]>("/admin/subjects"),
  createSubject: (b: NodeCreate) => api.post<S["CreatedOut"]>("/admin/subjects", b),
  createTopic: (subject: string, b: NodeCreate) => api.post<S["CreatedOut"]>(`/admin/subjects/${e(subject)}/topics`, b),
  createSubtopic: (topicId: string, b: NodeCreate) => api.post<S["CreatedOut"]>(`/admin/topics/${e(topicId)}/subtopics`, b),
  renameNode: (kind: "subjects" | "topics" | "subtopics", id: string, name: string) => api.patch<S["CreatedOut"]>(`/admin/${kind}/${e(id)}`, { name }),
  prerequisites: (topicId: string) => api.get<Prerequisites>(`/topics/${e(topicId)}/prerequisites`, { cache: "no-cache" }),
  setPrerequisites: (topicId: string, ids: string[]) => api.put<Prerequisites>(`/admin/topics/${e(topicId)}/prerequisites`, { prerequisite_ids: ids }),

  replaceSyllabus: (exam: string, stage: string, topics: SyllabusItem[]) => api.put<Record<string, unknown>>(`/admin/exams/${e(exam)}/stages/${e(stage)}/syllabus`, { topics }),

  blueprints: (exam: string, stage: string) => api.get<Blueprint[]>(`/admin/exams/${e(exam)}/stages/${e(stage)}/blueprints`),
  createBlueprint: (exam: string, stage: string, b: BlueprintCreate) => api.post<Blueprint>(`/admin/exams/${e(exam)}/stages/${e(stage)}/blueprints`, b),
  activateBlueprint: (exam: string, stage: string, version: number) => api.post<Blueprint>(`/admin/exams/${e(exam)}/stages/${e(stage)}/blueprints/${version}/activate`),
};
