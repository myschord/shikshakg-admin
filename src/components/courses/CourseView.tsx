"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, Pencil, Plus, Trash2, Video } from "lucide-react";
import { toast } from "react-toastify";
import { courseTone, hms } from "@/components/courses/CoursesScreen";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { COURSE_STATUS_LABEL, type Course, type CourseChapter, type CourseSection } from "@/lib/api/courses";
import { useCourse, useCourseMutations } from "@/lib/hooks/useCourses";

type Remove = { kind: "section" | "chapter"; id: string; title: string };

/** Build a course: sections hold chapters, chapters hold lectures. Order is changed with the move buttons. */
export default function CourseView() {
  const id = useSearchParams().get("id");
  const q = useCourse(id);
  const m = useCourseMutations(id);
  const [error, setError] = useState<unknown>(null);
  const [remove, setRemove] = useState<Remove | null>(null);
  const [status, setStatus] = useState<"published" | "archived" | "draft" | null>(null);
  const [editing, setEditing] = useState(false);

  /** Runs a change; the server's refusal (for example "section_not_empty") is shown above the outline. */
  async function run<T>(fn: () => Promise<T>, ok?: string): Promise<boolean> {
    setError(null);
    try {
      await fn();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  }

  if (!id) return <ErrorState error={new Error("No course was chosen.")} />;
  if (q.isPending) return <Skeleton className="mx-auto h-64 max-w-5xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;

  const move = (ids: string[], i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return next;
  };

  async function confirmRemove() {
    if (!remove) return;
    const ok = await run(() => (remove.kind === "section" ? m.deleteSection.mutateAsync(remove.id) : m.deleteChapter.mutateAsync(remove.id)), `${remove.kind === "section" ? "Section" : "Chapter"} removed.`);
    void ok;
    setRemove(null);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/courses" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden /> All courses
      </Link>
      <header className="space-y-3 rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">{c.title}</h1>
            <p className="mt-1 font-mono text-xs text-ink-muted">
              {c.exam_slug} / {c.slug}
            </p>
          </div>
          <Badge tone={courseTone(c.status)}>{COURSE_STATUS_LABEL[c.status] ?? c.status}</Badge>
        </div>
        <p className="text-sm text-ink-muted">
          {c.lecture_count} published {c.lecture_count === 1 ? "lecture" : "lectures"}, {hms(c.total_duration_seconds)}. {c.language === "hi" ? "Hindi" : "English"}.
        </p>
        {c.description && <p className="text-sm">{c.description}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing((v) => !v)} icon={<Pencil className="h-4 w-4" aria-hidden />} aria-expanded={editing}>
            Edit details
          </Button>
          {c.status !== "published" && <Button onClick={() => setStatus("published")}>Publish course</Button>}
          {c.status === "published" && (
            <Button variant="ghost" onClick={() => setStatus("draft")}>
              Move back to draft
            </Button>
          )}
          {c.status !== "archived" && (
            <Button variant="ghost" onClick={() => setStatus("archived")}>
              Archive
            </Button>
          )}
        </div>
        {editing && <Details course={c} onDone={() => setEditing(false)} />}
      </header>

      {error ? <ErrorState compact error={error} /> : null}

      <section aria-labelledby="outline-h" className="space-y-4">
        <h2 id="outline-h" className="text-lg font-bold">
          Outline
        </h2>
        {c.sections.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted">No sections yet. Add the first one below.</p>}
        {c.sections.map((s, si) => (
          <SectionCard
            key={s.id}
            section={s}
            first={si === 0}
            last={si === c.sections.length - 1}
            busy={m.renameSection.isPending || m.reorderSections.isPending}
            onMove={(d) => run(() => m.reorderSections.mutateAsync(move(c.sections.map((x) => x.id), si, d)))}
            onRename={(title) => run(() => m.renameSection.mutateAsync({ id: s.id, title }), "Section renamed.")}
            onRemove={() => setRemove({ kind: "section", id: s.id, title: s.title })}
            onAddChapter={(title) => run(() => m.addChapter.mutateAsync({ sectionId: s.id, title }), "Chapter added.")}
            renderChapter={(ch, ci) => (
              <ChapterCard
                key={ch.id}
                chapter={ch}
                first={ci === 0}
                last={ci === s.chapters.length - 1}
                onMove={(d) => run(() => m.reorderChapters.mutateAsync({ sectionId: s.id, ids: move(s.chapters.map((x) => x.id), ci, d) }))}
                onRename={(title) => run(() => m.renameChapter.mutateAsync({ id: ch.id, title }), "Chapter renamed.")}
                onRemove={() => setRemove({ kind: "chapter", id: ch.id, title: ch.title })}
                onAddLecture={(title, free) => run(() => m.addLecture.mutateAsync({ chapterId: ch.id, title, free }), "Lecture added.")}
                onMoveLecture={(li, d) => run(() => m.reorderLectures.mutateAsync({ chapterId: ch.id, ids: move(ch.lectures.map((x) => x.id), li, d) }))}
              />
            )}
          />
        ))}
        <AddTitle label="New section" button="Add section" onAdd={(t) => run(() => m.addSection.mutateAsync(t), "Section added.")} />
      </section>

      <ConfirmDialog
        open={!!remove}
        title={`Remove this ${remove?.kind ?? "item"}?`}
        confirmLabel="Remove"
        danger
        busy={m.deleteSection.isPending || m.deleteChapter.isPending}
        onCancel={() => setRemove(null)}
        onConfirm={confirmRemove}
      >
        {remove && (
          <>
            <p className="rounded-lg bg-bg-tint px-3 py-2 text-ink">
              <strong>{remove.title}</strong>
            </p>
            <p>It must be empty. {remove.kind === "section" ? "Remove its chapters first." : "Its lectures cannot be deleted here, so a chapter with lectures stays."}</p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!status}
        title={status === "published" ? "Publish this course?" : status === "archived" ? "Archive this course?" : "Move this course back to draft?"}
        confirmLabel={status === "published" ? "Publish" : status === "archived" ? "Archive" : "Move to draft"}
        danger={status !== "published"}
        busy={m.update.isPending}
        error={m.update.error}
        onCancel={() => {
          m.update.reset();
          setStatus(null);
        }}
        onConfirm={async () => {
          if (!status) return;
          try {
            await m.update.mutateAsync({ status });
            toast.success(status === "published" ? "Course published." : status === "archived" ? "Course archived." : "Course is a draft again.");
            setStatus(null);
          } catch {}
        }}
      >
        {status === "published" ? <p>Students can then see this course and its published lectures. At least one lecture must be published first.</p> : status === "archived" ? <p>Students will no longer see this course. Their progress is kept.</p> : <p>Students will no longer see this course until it is published again.</p>}
      </ConfirmDialog>
    </div>
  );
}

function Details({ course, onDone }: { course: Course; onDone: () => void }) {
  const { update } = useCourseMutations(course.id);
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [language, setLanguage] = useState(course.language as "hi" | "en");
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setErr("Enter a title.");
    setErr(null);
    try {
      await update.mutateAsync({ title: title.trim(), description: description.trim() || null, language });
      toast.success("Saved.");
      onDone();
    } catch {}
  }
  return (
    <form onSubmit={save} noValidate className="space-y-4 border-t border-line pt-4">
      <Field label="Title" required error={err}>{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />}</Field>
      <Field label="Language">
        {(p) => (
          <select {...p} value={language} onChange={(e) => setLanguage(e.target.value as "hi" | "en")} className={inputClass}>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
        )}
      </Field>
      <Field label="Description">{(p) => <textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3} className={`${inputClass} py-2`} />}</Field>
      {update.error ? <ErrorState compact error={update.error} /> : null}
      <Button type="submit" loading={update.isPending}>
        Save details
      </Button>
    </form>
  );
}

function MoveButtons({ name, first, last, onMove, busy }: { name: string; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; busy?: boolean }) {
  const cls = "inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-bg-tint hover:text-ink disabled:opacity-40";
  return (
    <>
      <button type="button" className={cls} disabled={first || busy} onClick={() => onMove(-1)} aria-label={`Move ${name} up`}>
        <ArrowUp className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" className={cls} disabled={last || busy} onClick={() => onMove(1)} aria-label={`Move ${name} down`}>
        <ArrowDown className="h-4 w-4" aria-hidden />
      </button>
    </>
  );
}

/** A title with a Rename button that turns it into an input. */
function Title({ text, level, onRename, label }: { text: string; level: 3 | 4; onRename: (t: string) => Promise<boolean>; label: string }) {
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(text);
  const inputId = useId();
  const Tag = level === 3 ? "h3" : "h4";
  if (!edit)
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Tag className={`${level === 3 ? "text-base" : "text-sm"} truncate font-bold`}>{text}</Tag>
        <button type="button" onClick={() => { setValue(text); setEdit(true); }} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-bg-tint" aria-label={`Rename ${label}`}>
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  return (
    <form
      className="flex flex-1 flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        if (value.trim() === text || (await onRename(value.trim()))) setEdit(false);
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        New name for {label}
      </label>
      <input id={inputId} autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} className={`${inputClass} max-w-sm flex-1`} />
      <Button type="submit" className="!min-h-[44px]">
        Save name
      </Button>
      <Button type="button" variant="ghost" onClick={() => setEdit(false)}>
        Cancel
      </Button>
    </form>
  );
}

function AddTitle({ label, button, onAdd, free }: { label: string; button: string; onAdd: (title: string, free: boolean) => Promise<boolean>; free?: boolean }) {
  const [title, setTitle] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return setErr("Enter a name.");
        setErr(null);
        setBusy(true);
        const ok = await onAdd(title.trim(), isFree);
        setBusy(false);
        if (ok) {
          setTitle("");
          setIsFree(false);
        }
      }}
    >
      <Field label={label} error={err} className="min-w-[14rem] flex-1">{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />}</Field>
      {free && (
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="h-4 w-4 accent-primary" />
          Free preview
        </label>
      )}
      <Button type="submit" variant="secondary" loading={busy} icon={<Plus className="h-4 w-4" aria-hidden />}>
        {button}
      </Button>
    </form>
  );
}

function SectionCard({ section: s, first, last, busy, onMove, onRename, onRemove, onAddChapter, renderChapter }: { section: CourseSection; first: boolean; last: boolean; busy: boolean; onMove: (d: -1 | 1) => void; onRename: (t: string) => Promise<boolean>; onRemove: () => void; onAddChapter: (t: string) => Promise<boolean>; renderChapter: (c: CourseChapter, i: number) => React.ReactNode }) {
  return (
    <section aria-label={`Section ${s.title}`} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-1">
        <Title text={s.title} level={3} label={`section ${s.title}`} onRename={onRename} />
        {s.subject_name && <Badge tone="info">{s.subject_name}</Badge>}
        <MoveButtons name={`section ${s.title}`} first={first} last={last} busy={busy} onMove={onMove} />
        <button type="button" onClick={onRemove} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-error-text hover:bg-error-tint" aria-label={`Remove section ${s.title}`}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="space-y-3 border-l-2 border-border-tint pl-4">
        {s.chapters.length === 0 && <p className="text-sm text-ink-muted">No chapters in this section yet.</p>}
        {s.chapters.map(renderChapter)}
        <AddTitle label={`New chapter in ${s.title}`} button="Add chapter" onAdd={onAddChapter} />
      </div>
    </section>
  );
}

function ChapterCard({ chapter: ch, first, last, onMove, onRename, onRemove, onAddLecture, onMoveLecture }: { chapter: CourseChapter; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onRename: (t: string) => Promise<boolean>; onRemove: () => void; onAddLecture: (t: string, free: boolean) => Promise<boolean>; onMoveLecture: (i: number, d: -1 | 1) => void }) {
  return (
    <div className="space-y-2 rounded-xl bg-bg-tint p-3">
      <div className="flex flex-wrap items-center gap-1">
        <Title text={ch.title} level={4} label={`chapter ${ch.title}`} onRename={onRename} />
        <MoveButtons name={`chapter ${ch.title}`} first={first} last={last} onMove={onMove} />
        <button type="button" onClick={onRemove} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-error-text hover:bg-error-tint" aria-label={`Remove chapter ${ch.title}`}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ul className="space-y-1">
        {ch.lectures.map((l, li) => (
          <li key={l.id} className="flex flex-wrap items-center gap-1 rounded-lg bg-white px-2">
            <Video className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            <Link href={`/courses/lecture?id=${l.id}`} className="min-h-[44px] flex-1 content-center text-sm font-semibold text-primary hover:underline">
              {l.title}
            </Link>
            <Badge tone={l.status === "published" ? "success" : l.status === "archived" ? "neutral" : "warning"}>{l.status === "published" ? "Published" : l.status === "archived" ? "Archived" : "Draft"}</Badge>
            {l.is_free_preview && <Badge tone="info">Free preview</Badge>}
            <span className="text-xs text-ink-muted">{l.duration_seconds ? hms(l.duration_seconds) : "No video"}</span>
            <MoveButtons name={`lecture ${l.title}`} first={li === 0} last={li === ch.lectures.length - 1} onMove={(d) => onMoveLecture(li, d)} />
          </li>
        ))}
      </ul>
      <AddTitle label={`New lecture in ${ch.title}`} button="Add lecture" free onAdd={onAddLecture} />
    </div>
  );
}
