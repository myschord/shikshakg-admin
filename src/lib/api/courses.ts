import { api, type Page } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
const e = encodeURIComponent;

export type Course = S["CourseAdminOut"];
export type CourseSection = Course["sections"][number];
export type CourseChapter = CourseSection["chapters"][number];
export type CourseLecture = CourseChapter["lectures"][number];
export type CourseCreate = S["CourseCreateIn"];
export type CourseUpdate = S["CourseUpdateIn"];
export type Lecture = S["LectureAdminOut"];
export type LectureUpdate = S["LectureUpdateIn"];
export type Resource = Lecture["resources"][number];

export const COURSE_STATUS_LABEL: Record<string, string> = { draft: "Draft", published: "Published", archived: "Archived" };
export const RESOURCE_KINDS = [
  { v: "pdf", label: "PDF" },
  { v: "notes", label: "Notes" },
  { v: "slides", label: "Slides" },
] as const;
/** What the server accepts for a lecture resource file. */
export const RESOURCE_TYPES = ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "image/png", "image/jpeg"];
export const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const RESOURCE_MAX_BYTES = 25 * 1024 * 1024;

// Staff routes for courses (backend phase 4). Every structure change returns the whole course outline, so the
// screen always shows what the server holds. Reordering sends the complete new order.
export const coursesApi = {
  list: (p: { exam?: string; status?: string; cursor?: string } = {}) => api.get<Page<Course>>("/admin/courses", { query: { exam_slug: p.exam, status: p.status, cursor: p.cursor, limit: 50 } }),
  get: (id: string) => api.get<Course>(`/admin/courses/${e(id)}`),
  create: (body: CourseCreate) => api.post<Course>("/admin/courses", body),
  update: (id: string, body: CourseUpdate) => api.patch<Course>(`/admin/courses/${e(id)}`, body),
  addSection: (courseId: string, title: string) => api.post<Course>(`/admin/courses/${e(courseId)}/sections`, { title }),
  reorderSections: (courseId: string, ids: string[]) => api.put<Course>(`/admin/courses/${e(courseId)}/sections/order`, { ordered_ids: ids }),
  renameSection: (id: string, title: string) => api.patch<Course>(`/admin/sections/${e(id)}`, { title }),
  deleteSection: (id: string) => api.delete<Course>(`/admin/sections/${e(id)}`),
  addChapter: (sectionId: string, title: string) => api.post<Course>(`/admin/sections/${e(sectionId)}/chapters`, { title }),
  reorderChapters: (sectionId: string, ids: string[]) => api.put<Course>(`/admin/sections/${e(sectionId)}/chapters/order`, { ordered_ids: ids }),
  renameChapter: (id: string, title: string) => api.patch<Course>(`/admin/chapters/${e(id)}`, { title }),
  deleteChapter: (id: string) => api.delete<Course>(`/admin/chapters/${e(id)}`),
  addLecture: (chapterId: string, title: string, isFreePreview = false) => api.post<Lecture>(`/admin/chapters/${e(chapterId)}/lectures`, { title, is_free_preview: isFreePreview }),
  reorderLectures: (chapterId: string, ids: string[]) => api.put<Course>(`/admin/chapters/${e(chapterId)}/lectures/order`, { ordered_ids: ids }),
  lecture: (id: string) => api.get<Lecture>(`/admin/lectures/${e(id)}`),
  updateLecture: (id: string, body: LectureUpdate) => api.patch<Lecture>(`/admin/lectures/${e(id)}`, body),
  setTopics: (id: string, topics: { topic_id: string; subtopic_id?: string | null }[]) => api.put<Lecture>(`/admin/lectures/${e(id)}/topics`, { topics }),
  /** The MP4 is the request body. On local storage the file itself is what plays. */
  uploadVideo: (id: string, file: Blob, durationSeconds: number) => api.post<Lecture>(`/admin/lectures/${e(id)}/video`, new Blob([file], { type: "video/mp4" }), { query: { duration_seconds: durationSeconds } }),
  uploadResource: (id: string, file: File, kind: string, title: string) => api.post<Lecture>(`/admin/lectures/${e(id)}/resources`, file, { query: { kind, title, filename: file.name } }),
  addLink: (id: string, title: string, url: string) => api.post<Lecture>(`/admin/lectures/${e(id)}/resources/link`, { title, url }),
  deleteResource: (id: string, resourceId: string) => api.delete<Lecture>(`/admin/lectures/${e(id)}/resources/${e(resourceId)}`),
};
