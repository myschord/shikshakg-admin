"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { COURSE_STATUS_LABEL, type Course } from "@/lib/api/courses";
import { useCategories } from "@/lib/hooks/useExamEvents";
import { useCourseMutations, useCourses } from "@/lib/hooks/useCourses";

export const courseTone = (s: string) => (s === "published" ? "success" : s === "archived" ? "neutral" : "warning");
export const hms = (sec: number | null | undefined) => {
  if (!sec) return "0 min";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Video courses, per exam. A course is a draft until it has a published lecture and is published itself. */
export default function CoursesScreen() {
  const [exam, setExam] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const list = useCourses({ exam: exam || undefined, status: status || undefined });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const columns: Column<Course>[] = [
    {
      key: "t",
      header: "Course",
      cell: (c) => (
        <>
          <Link href={`/courses/view?id=${c.id}`} className="font-semibold text-primary hover:underline">
            {c.title}
          </Link>
          <span className="block font-mono text-xs text-ink-muted">{c.slug}</span>
        </>
      ),
    },
    { key: "e", header: "Exam", cell: (c) => c.exam_slug },
    { key: "l", header: "Language", cell: (c) => (c.language === "hi" ? "Hindi" : "English") },
    { key: "n", header: "Lectures", cell: (c) => `${c.lecture_count} (${hms(c.total_duration_seconds)})` },
    { key: "s", header: "State", cell: (c) => <Badge tone={courseTone(c.status)}>{COURSE_STATUS_LABEL[c.status] ?? c.status}</Badge> },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Courses</h1>
          <p className="mt-1 text-sm text-ink-muted">Video courses made of sections, chapters and lectures. Open a course to build it.</p>
        </div>
        <Button onClick={() => setCreating(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>
          New course
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Exam">{(p) => <ExamSelect {...p} allLabel="All exams" value={exam} onChange={setExam} />}</Field>
        <Field label="State">
          {(p) => (
            <select {...p} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">All</option>
              {Object.entries(COURSE_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <DataTable caption="Courses" columns={columns} rows={rows} rowKey={(c) => c.id} loading={list.isPending} empty={<><p className="font-semibold text-ink">No courses yet</p><p className="mt-1">Create one, then add sections, chapters and lectures.</p></>} />
      )}
      {list.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
      <CreateCourse open={creating} defaultExam={exam} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateCourse({ open, defaultExam, onClose }: { open: boolean; defaultExam: string; onClose: () => void }) {
  const router = useRouter();
  const categories = useCategories();
  const { create } = useCourseMutations();
  const [exam, setExam] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [language, setLanguage] = useState<"hi" | "en">("hi");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const examValue = exam || defaultExam || categories.data?.[0]?.exams[0]?.slug || "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!title.trim()) err.title = "Enter a title.";
    if (!SLUG.test(slug)) err.slug = "Use lowercase letters, digits and single dashes, for example polity-basics.";
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      const c = await create.mutateAsync({ exam_slug: examValue, title: title.trim(), slug, language, description: description.trim() || null });
      onClose();
      router.push(`/courses/view?id=${c.id}`);
    } catch {}
  }

  return (
    <Dialog open={open} title="New course" onClose={onClose} busy={create.isPending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Exam" required>{(p) => <ExamSelect {...p} value={examValue} onChange={setExam} />}</Field>
        <Field label="Title" required error={errors.title}>{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />}</Field>
        <Field label="Short code" required error={errors.slug} help="Used in the course address. It cannot be changed later.">{(p) => <input {...p} value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={80} className={`${inputClass} font-mono`} />}</Field>
        <Field label="Language">
          {(p) => (
            <select {...p} value={language} onChange={(e) => setLanguage(e.target.value as "hi" | "en")} className={inputClass}>
              <option value="hi">Hindi</option>
              <option value="en">English</option>
            </select>
          )}
        </Field>
        <Field label="Description">{(p) => <textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3} className={`${inputClass} py-2`} />}</Field>
        {create.error ? <ErrorState compact error={create.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create course
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
