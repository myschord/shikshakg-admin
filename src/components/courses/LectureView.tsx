"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "react-toastify";
import { hms } from "@/components/courses/CoursesScreen";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { RESOURCE_KINDS, RESOURCE_MAX_BYTES, RESOURCE_TYPES, VIDEO_MAX_BYTES, type Lecture, type Resource } from "@/lib/api/courses";
import { useCourse, useLecture, useLectureMutations } from "@/lib/hooks/useCourses";
import { useExam } from "@/lib/hooks/useExamEvents";
import { useSyllabus } from "@/lib/hooks/useQuestions";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const https = (v: string) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/** One lecture: its details, the video, the topics it covers and its notes. */
export default function LectureView() {
  const id = useSearchParams().get("id");
  const q = useLecture(id);
  const course = useCourse(q.data?.course_id ?? null);
  if (!id) return <ErrorState error={new Error("No lecture was chosen.")} />;
  if (q.isPending) return <Skeleton className="mx-auto h-64 max-w-4xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const l = q.data;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/courses/view?id=${l.course_id}`} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Back to {course.data?.title ?? "the course"}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{l.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge tone={l.status === "published" ? "success" : l.status === "archived" ? "neutral" : "warning"}>{l.status === "published" ? "Published" : l.status === "archived" ? "Archived" : "Draft"}</Badge>
          <Badge tone={l.video_status === "ready" ? "success" : "warning"}>{l.video_status === "ready" ? `Video ready, ${hms(l.duration_seconds)}` : l.video_status ? `Video ${l.video_status}` : "No video yet"}</Badge>
        </div>
      </header>
      <Details lecture={l} />
      <VideoPanel lecture={l} />
      <TopicsPanel lecture={l} examSlug={course.data?.exam_slug ?? null} />
      <ResourcesPanel lecture={l} />
    </div>
  );
}

const Card = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section aria-labelledby={id} className="space-y-4 rounded-2xl border border-line bg-white p-5">
    <h2 id={id} className="text-lg font-bold">
      {title}
    </h2>
    {children}
  </section>
);

function Details({ lecture: l }: { lecture: Lecture }) {
  const { update } = useLectureMutations(l.id);
  const [title, setTitle] = useState(l.title);
  const [description, setDescription] = useState(l.description ?? "");
  const [free, setFree] = useState(l.is_free_preview);
  const [err, setErr] = useState<string | null>(null);
  const [publish, setPublish] = useState<"published" | "draft" | "archived" | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setErr("Enter a title.");
    setErr(null);
    try {
      await update.mutateAsync({ title: title.trim(), description: description.trim() || null, is_free_preview: free });
      toast.success("Saved.");
    } catch {}
  }
  return (
    <Card id="det-h" title="Details">
      <form onSubmit={save} noValidate className="space-y-4">
        <Field label="Title" required error={err}>{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />}</Field>
        <Field label="Description">{(p) => <textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3} className={`${inputClass} py-2`} />}</Field>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className="h-4 w-4 accent-primary" />
          Free preview (students can watch it without buying the course)
        </label>
        {update.error && !publish ? <ErrorState compact error={update.error} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={update.isPending && !publish}>
            Save details
          </Button>
          {l.status !== "published" ? (
            <Button type="button" variant="secondary" onClick={() => setPublish("published")}>
              Publish lecture
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setPublish("draft")}>
              Move back to draft
            </Button>
          )}
          {l.status !== "archived" && (
            <Button type="button" variant="ghost" onClick={() => setPublish("archived")}>
              Archive
            </Button>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={!!publish}
        title={publish === "published" ? "Publish this lecture?" : publish === "archived" ? "Archive this lecture?" : "Move this lecture back to draft?"}
        confirmLabel={publish === "published" ? "Publish" : publish === "archived" ? "Archive" : "Move to draft"}
        danger={publish !== "published"}
        busy={update.isPending}
        error={update.error}
        onCancel={() => {
          update.reset();
          setPublish(null);
        }}
        onConfirm={async () => {
          if (!publish) return;
          try {
            await update.mutateAsync({ status: publish });
            toast.success(publish === "published" ? "Lecture published." : publish === "archived" ? "Lecture archived." : "Lecture is a draft again.");
            setPublish(null);
          } catch {}
        }}
      >
        {publish === "published" ? <p>Students who can open the course can then watch it. The video must be uploaded first.</p> : <p>Students will no longer be able to watch this lecture. Their progress is kept.</p>}
      </ConfirmDialog>
    </Card>
  );
}

/** Reads the length of a video from the file itself, so nobody has to type it. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (n: number | null) => {
      URL.revokeObjectURL(url);
      resolve(n);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? Math.ceil(v.duration) : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

function VideoPanel({ lecture: l }: { lecture: Lecture }) {
  const { uploadVideo } = useLectureMutations(l.id);
  const [file, setFile] = useState<File | null>(null);
  const [seconds, setSeconds] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [secError, setSecError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function pick(f: File | null) {
    setFile(f);
    setSeconds("");
    setSecError(null);
    uploadVideo.reset();
    if (!f) return setFileError(null);
    if (f.type !== "video/mp4" && !/\.mp4$/i.test(f.name)) return setFileError("Use an MP4 video.");
    if (f.size > VIDEO_MAX_BYTES) return setFileError(`The video is ${mb(f.size)}. The most the server takes is ${mb(VIDEO_MAX_BYTES)}.`);
    setFileError(null);
    setReading(true);
    const d = await readDuration(f);
    setReading(false);
    if (d) setSeconds(String(d));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || fileError) return;
    const n = Number(seconds);
    if (!Number.isInteger(n) || n < 1 || n > 86400) return setSecError("Enter the length in whole seconds, from 1 to 86400.");
    setSecError(null);
    try {
      await uploadVideo.mutateAsync({ file, seconds: n });
      toast.success("Video uploaded.");
      setFile(null);
      setSeconds("");
    } catch {}
  }

  return (
    <Card id="vid-h" title="Video">
      <p className="text-sm text-ink-muted">{l.video_status === "ready" ? "A video is attached. Uploading another replaces it." : "Upload the lecture as an MP4 (up to 200 MB). A lecture can be published once its video is ready."}</p>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="MP4 file" error={fileError}>{(p) => <input {...p} type="file" accept="video/mp4,.mp4" onChange={(e) => void pick(e.target.files?.[0] ?? null)} className={`${inputClass} py-2`} />}</Field>
        {file && !fileError && (
          <Field label="Length in seconds" error={secError} help={reading ? "Reading the length from the file…" : `${file.name}, ${mb(file.size)}. Filled in from the file; change it if it is wrong.`}>
            {(p) => <input {...p} inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value.replace(/\D/g, ""))} className={inputClass} />}
          </Field>
        )}
        {uploadVideo.isPending && (
          <p role="status" className="text-sm font-semibold">
            Uploading {file ? mb(file.size) : "the video"}. Keep this page open.
          </p>
        )}
        {uploadVideo.error ? <ErrorState compact error={uploadVideo.error} /> : null}
        <Button type="submit" disabled={!file || !!fileError || reading} loading={uploadVideo.isPending} icon={<Upload className="h-4 w-4" aria-hidden />}>
          Upload video
        </Button>
      </form>
    </Card>
  );
}

function TopicsPanel({ lecture: l, examSlug }: { lecture: Lecture; examSlug: string | null }) {
  const { setTopics } = useLectureMutations(l.id);
  const exam = useExam(examSlug);
  const stages = exam.data?.stages ?? [];
  const [stage, setStage] = useState("");
  const effectiveStage = stage || stages[0]?.slug || null;
  const syllabus = useSyllabus(examSlug, stages.length > 1 ? effectiveStage : null);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const subjects = syllabus.data?.subjects ?? [];
  const topics = subjects.find((s) => s.slug === subject)?.topics ?? [];
  const subtopics = topics.find((t) => t.slug === topic)?.subtopics ?? [];
  const current = l.topics.map((t) => ({ topic_id: t.topic_id, subtopic_id: t.subtopic_id }));

  async function add() {
    const t = topics.find((x) => x.slug === topic);
    if (!t) return;
    const st = subtopics.find((x) => x.slug === subtopic);
    try {
      await setTopics.mutateAsync([...current.filter((c) => c.topic_id !== t.id), { topic_id: t.id, subtopic_id: st?.id ?? null }]);
      toast.success("Topic added.");
      setTopic("");
      setSubtopic("");
    } catch {}
  }

  return (
    <Card id="top-h" title="Topics covered">
      <p className="text-sm text-ink-muted">Topics link this lecture to past-paper questions and practice for the same topic.</p>
      {l.topics.length === 0 ? (
        <p className="text-sm text-ink-muted">No topics yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {l.topics.map((t) => (
            <li key={t.topic_id} className="flex items-center gap-1 rounded-full bg-border-tint py-1 pl-3 text-sm font-semibold">
              {t.topic_name}
              <button type="button" disabled={setTopics.isPending} onClick={() => setTopics.mutate(current.filter((c) => c.topic_id !== t.topic_id))} aria-label={`Remove topic ${t.topic_name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-white">
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {stages.length > 1 && (
          <Field label="Stage">
            {(p) => (
              <select {...p} value={effectiveStage ?? ""} onChange={(e) => { setStage(e.target.value); setSubject(""); setTopic(""); setSubtopic(""); }} className={inputClass}>
                {stages.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Subject">
          {(p) => (
            <select {...p} value={subject} onChange={(e) => { setSubject(e.target.value); setTopic(""); setSubtopic(""); }} className={inputClass} disabled={syllabus.isPending}>
              <option value="">Choose a subject</option>
              {subjects.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Topic">
          {(p) => (
            <select {...p} value={topic} onChange={(e) => { setTopic(e.target.value); setSubtopic(""); }} className={inputClass} disabled={!subject}>
              <option value="">Choose a topic</option>
              {topics.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Subtopic (optional)">
          {(p) => (
            <select {...p} value={subtopic} onChange={(e) => setSubtopic(e.target.value)} className={inputClass} disabled={!topic || subtopics.length === 0}>
              <option value="">None</option>
              {subtopics.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {syllabus.isError && <ErrorState compact error={syllabus.error} />}
      {setTopics.error ? <ErrorState compact error={setTopics.error} /> : null}
      <Button type="button" variant="secondary" onClick={add} disabled={!topic} loading={setTopics.isPending}>
        Add topic
      </Button>
    </Card>
  );
}

function ResourcesPanel({ lecture: l }: { lecture: Lecture }) {
  const { uploadResource, addLink, deleteResource } = useLectureMutations(l.id);
  const [kind, setKind] = useState<string>("pdf");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lt, setLt] = useState("");
  const [url, setUrl] = useState("");
  const [lerr, setLerr] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Resource | null>(null);
  const [fileKey, setFileKey] = useState(0);

  useEffect(() => {
    if (file && !title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  }, [file, title]);

  async function sendFile(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!file) err.file = "Choose a file.";
    else if (!RESOURCE_TYPES.includes(file.type)) err.file = "Use a PDF, text file, PowerPoint (.pptx), PNG or JPEG.";
    else if (file.size > RESOURCE_MAX_BYTES) err.file = `The file is ${mb(file.size)}. The most the server takes is ${mb(RESOURCE_MAX_BYTES)}.`;
    if (!title.trim()) err.title = "Enter a title.";
    setErrors(err);
    if (Object.keys(err).length || !file) return;
    try {
      await uploadResource.mutateAsync({ file, kind, title: title.trim() });
      toast.success("File added.");
      setFile(null);
      setTitle("");
      setFileKey((k) => k + 1);
    } catch {}
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!lt.trim()) err.title = "Enter a title.";
    if (!https(url)) err.url = "Enter an address that starts with https://.";
    setLerr(err);
    if (Object.keys(err).length) return;
    try {
      await addLink.mutateAsync({ title: lt.trim(), url });
      toast.success("Link added.");
      setLt("");
      setUrl("");
    } catch {}
  }

  return (
    <Card id="res-h" title="Notes and links">
      {l.resources.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing attached yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {l.resources.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-1">
              {r.kind === "link" ? <ExternalLink className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden /> : <FileText className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />}
              <span className="min-h-[44px] flex-1 content-center text-sm">
                <span className="font-semibold">{r.title}</span>
                <span className="block text-xs text-ink-muted">{r.kind === "link" ? r.url : `${r.kind.toUpperCase()}, ${r.file_name ?? ""}${r.size_bytes ? `, ${mb(r.size_bytes)}` : ""}`}</span>
              </span>
              <button type="button" onClick={() => setRemoving(r)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-error-text hover:bg-error-tint" aria-label={`Remove ${r.title}`}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={sendFile} noValidate className="space-y-4 rounded-xl bg-bg-tint p-4">
        <h3 className="font-bold">Add a file</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind">
            {(p) => (
              <select {...p} value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
                {RESOURCE_KINDS.map((k) => (
                  <option key={k.v} value={k.v}>
                    {k.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Title" error={errors.title}>{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />}</Field>
        </div>
        <Field label="File" error={errors.file} help="PDF, text, PowerPoint (.pptx), PNG or JPEG, up to 25 MB.">
          {(p) => <input key={fileKey} {...p} type="file" accept=".pdf,.txt,.pptx,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${inputClass} bg-white py-2`} />}
        </Field>
        {uploadResource.error ? <ErrorState compact error={uploadResource.error} /> : null}
        <Button type="submit" variant="secondary" loading={uploadResource.isPending} icon={<Upload className="h-4 w-4" aria-hidden />}>
          Upload file
        </Button>
      </form>

      <form onSubmit={sendLink} noValidate className="space-y-4 rounded-xl bg-bg-tint p-4">
        <h3 className="font-bold">Add a link</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Link title" error={lerr.title}>{(p) => <input {...p} value={lt} onChange={(e) => setLt(e.target.value)} maxLength={200} className={inputClass} />}</Field>
          <Field label="Address" error={lerr.url}>{(p) => <input {...p} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" maxLength={1024} className={inputClass} />}</Field>
        </div>
        {addLink.error ? <ErrorState compact error={addLink.error} /> : null}
        <Button type="submit" variant="secondary" loading={addLink.isPending}>
          Add link
        </Button>
      </form>

      <ConfirmDialog
        open={!!removing}
        title="Remove this item?"
        confirmLabel="Remove"
        danger
        busy={deleteResource.isPending}
        error={deleteResource.error}
        onCancel={() => {
          deleteResource.reset();
          setRemoving(null);
        }}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await deleteResource.mutateAsync(removing.id);
            toast.success("Removed.");
            setRemoving(null);
          } catch {}
        }}
      >
        {removing && (
          <p className="rounded-lg bg-bg-tint px-3 py-2 text-ink">
            <strong>{removing.title}</strong> will no longer be available to students.
          </p>
        )}
      </ConfirmDialog>
    </Card>
  );
}
