"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { catalogAdminApi, type BlueprintCreate, type CategoryCreate, type CategoryUpdate, type ExamCreate, type ExamUpdate, type NodeCreate, type StageCreate, type StageUpdate, type SyllabusItem } from "@/lib/api/catalogAdmin";

export const useTaxonomy = () => useQuery({ queryKey: ["catalogAdmin", "taxonomy"], queryFn: catalogAdminApi.taxonomy, staleTime: 15_000 });
export const useBlueprints = (exam: string | null, stage: string | null) => useQuery({ queryKey: ["catalogAdmin", "blueprints", exam, stage], queryFn: () => catalogAdminApi.blueprints(exam as string, stage as string), enabled: !!exam && !!stage, staleTime: 5_000 });
export const usePrerequisites = (topicId: string | null) => useQuery({ queryKey: ["catalogAdmin", "prereq", topicId], queryFn: () => catalogAdminApi.prerequisites(topicId as string), enabled: !!topicId, staleTime: 0 });

/** The public catalog, syllabus and exam pickers are cached for ten minutes across the console, so every edit here refreshes them. */
function useRefresh() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: ["catalog"] }), qc.invalidateQueries({ queryKey: ["syllabus"] }), qc.invalidateQueries({ queryKey: ["catalogAdmin"] })]);
}

export function useCatalogMutations() {
  const refresh = useRefresh();
  const o = { onSuccess: refresh };
  return {
    createCategory: useMutation({ mutationFn: (b: CategoryCreate) => catalogAdminApi.createCategory(b), ...o }),
    updateCategory: useMutation({ mutationFn: (v: { slug: string; body: CategoryUpdate }) => catalogAdminApi.updateCategory(v.slug, v.body), ...o }),
    createExam: useMutation({ mutationFn: (b: ExamCreate) => catalogAdminApi.createExam(b), ...o }),
    updateExam: useMutation({ mutationFn: (v: { slug: string; body: ExamUpdate }) => catalogAdminApi.updateExam(v.slug, v.body), ...o }),
    createStage: useMutation({ mutationFn: (v: { exam: string; body: StageCreate }) => catalogAdminApi.createStage(v.exam, v.body), ...o }),
    updateStage: useMutation({ mutationFn: (v: { exam: string; stage: string; body: StageUpdate }) => catalogAdminApi.updateStage(v.exam, v.stage, v.body), ...o }),
    createSubject: useMutation({ mutationFn: (b: NodeCreate) => catalogAdminApi.createSubject(b), ...o }),
    createTopic: useMutation({ mutationFn: (v: { subject: string; body: NodeCreate }) => catalogAdminApi.createTopic(v.subject, v.body), ...o }),
    createSubtopic: useMutation({ mutationFn: (v: { topicId: string; body: NodeCreate }) => catalogAdminApi.createSubtopic(v.topicId, v.body), ...o }),
    renameNode: useMutation({ mutationFn: (v: { kind: "subjects" | "topics" | "subtopics"; id: string; name: string }) => catalogAdminApi.renameNode(v.kind, v.id, v.name), ...o }),
    setPrerequisites: useMutation({ mutationFn: (v: { topicId: string; ids: string[] }) => catalogAdminApi.setPrerequisites(v.topicId, v.ids), ...o }),
    replaceSyllabus: useMutation({ mutationFn: (v: { exam: string; stage: string; topics: SyllabusItem[] }) => catalogAdminApi.replaceSyllabus(v.exam, v.stage, v.topics), ...o }),
    createBlueprint: useMutation({ mutationFn: (v: { exam: string; stage: string; body: BlueprintCreate }) => catalogAdminApi.createBlueprint(v.exam, v.stage, v.body), ...o }),
    activateBlueprint: useMutation({ mutationFn: (v: { exam: string; stage: string; version: number }) => catalogAdminApi.activateBlueprint(v.exam, v.stage, v.version), ...o }),
  };
}
