"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coursesApi, type Course, type CourseCreate, type CourseUpdate, type Lecture, type LectureUpdate } from "@/lib/api/courses";

export const useCourses = (p: { exam?: string; status?: string }) =>
  useInfiniteQuery({
    queryKey: ["courses", "list", p],
    queryFn: ({ pageParam }) => coursesApi.list({ ...p, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.has_more ? (last.next_cursor ?? undefined) : undefined),
    staleTime: 10_000,
  });

export const useCourse = (id: string | null) => useQuery({ queryKey: ["courses", "one", id], queryFn: () => coursesApi.get(id as string), enabled: !!id, staleTime: 5_000 });
export const useLecture = (id: string | null) => useQuery({ queryKey: ["courses", "lecture", id], queryFn: () => coursesApi.lecture(id as string), enabled: !!id, staleTime: 5_000 });

/** Every structure change answers with the whole course, which goes straight into the cache. */
export function useCourseMutations(courseId?: string | null) {
  const qc = useQueryClient();
  const put = (c: Course) => {
    qc.setQueryData(["courses", "one", c.id], c);
    void qc.invalidateQueries({ queryKey: ["courses", "list"] });
  };
  const refreshCourse = () => {
    void qc.invalidateQueries({ queryKey: ["courses", "one"] });
    void qc.invalidateQueries({ queryKey: ["courses", "list"] });
  };
  return {
    create: useMutation({ mutationFn: (b: CourseCreate) => coursesApi.create(b), onSuccess: put }),
    update: useMutation({ mutationFn: (b: CourseUpdate) => coursesApi.update(courseId as string, b), onSuccess: put }),
    addSection: useMutation({ mutationFn: (title: string) => coursesApi.addSection(courseId as string, title), onSuccess: put }),
    reorderSections: useMutation({ mutationFn: (ids: string[]) => coursesApi.reorderSections(courseId as string, ids), onSuccess: put }),
    renameSection: useMutation({ mutationFn: (v: { id: string; title: string }) => coursesApi.renameSection(v.id, v.title), onSuccess: put }),
    deleteSection: useMutation({ mutationFn: (id: string) => coursesApi.deleteSection(id), onSuccess: put }),
    addChapter: useMutation({ mutationFn: (v: { sectionId: string; title: string }) => coursesApi.addChapter(v.sectionId, v.title), onSuccess: put }),
    reorderChapters: useMutation({ mutationFn: (v: { sectionId: string; ids: string[] }) => coursesApi.reorderChapters(v.sectionId, v.ids), onSuccess: put }),
    renameChapter: useMutation({ mutationFn: (v: { id: string; title: string }) => coursesApi.renameChapter(v.id, v.title), onSuccess: put }),
    deleteChapter: useMutation({ mutationFn: (id: string) => coursesApi.deleteChapter(id), onSuccess: put }),
    addLecture: useMutation({ mutationFn: (v: { chapterId: string; title: string; free?: boolean }) => coursesApi.addLecture(v.chapterId, v.title, v.free), onSuccess: refreshCourse }),
    reorderLectures: useMutation({ mutationFn: (v: { chapterId: string; ids: string[] }) => coursesApi.reorderLectures(v.chapterId, v.ids), onSuccess: put }),
  };
}

/** Changes to one lecture. Each answers with the lecture; the course outline is refreshed because it shows status and length. */
export function useLectureMutations(lectureId: string) {
  const qc = useQueryClient();
  const done = (l: Lecture) => {
    qc.setQueryData(["courses", "lecture", lectureId], l);
    void qc.invalidateQueries({ queryKey: ["courses", "one"] });
    void qc.invalidateQueries({ queryKey: ["courses", "list"] });
  };
  return {
    update: useMutation({ mutationFn: (b: LectureUpdate) => coursesApi.updateLecture(lectureId, b), onSuccess: done }),
    setTopics: useMutation({ mutationFn: (t: { topic_id: string; subtopic_id?: string | null }[]) => coursesApi.setTopics(lectureId, t), onSuccess: done }),
    uploadVideo: useMutation({ mutationFn: (v: { file: Blob; seconds: number }) => coursesApi.uploadVideo(lectureId, v.file, v.seconds), onSuccess: done }),
    uploadResource: useMutation({ mutationFn: (v: { file: File; kind: string; title: string }) => coursesApi.uploadResource(lectureId, v.file, v.kind, v.title), onSuccess: done }),
    addLink: useMutation({ mutationFn: (v: { title: string; url: string }) => coursesApi.addLink(lectureId, v.title, v.url), onSuccess: done }),
    deleteResource: useMutation({ mutationFn: (id: string) => coursesApi.deleteResource(lectureId, id), onSuccess: done }),
  };
}
