"use client";

import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { PLACEMENTS, type MediaPlacement, type QuestionMedia } from "@/lib/api/questions";
import { useQuestionMedia, useQuestionMutations } from "@/lib/hooks/useQuestions";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const placementLabel = (p: string) => (p === "stem" ? "Question" : p === "explanation" ? "Explanation" : `Option ${p.replace("option_", "")}`);

/** Images attached to a question, one placement at a time (the question, an option, or the explanation). */
export default function MediaPanel({ questionId }: { questionId: string }) {
  const media = useQuestionMedia(questionId);
  const { addMedia, deleteMedia } = useQuestionMutations();
  const [placement, setPlacement] = useState<MediaPlacement>("stem");
  const [alt, setAlt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<QuestionMedia | null>(null);

  const pick = (f: File | null) => {
    setFile(f);
    setFileError(!f ? null : !TYPES.includes(f.type) ? "Use a PNG, JPEG or WebP image." : f.size > MAX_BYTES ? "The image is larger than 5 MB." : null);
  };

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || fileError) return;
    try {
      await addMedia.mutateAsync({ id: questionId, file, placement, alt: alt.trim(), position: (media.data ?? []).filter((m) => m.placement === placement).length });
      toast.success("Image added.");
      setFile(null);
      setAlt("");
      (document.getElementById("media-file") as HTMLInputElement | null)?.setAttribute("value", "");
    } catch {
      // shown below
    }
  }

  return (
    <section aria-labelledby="media-h" className="space-y-4 rounded-xl border border-line bg-white p-4">
      <h2 id="media-h" className="text-lg font-bold">
        Images
      </h2>
      {media.isPending ? (
        <Skeleton className="h-20" />
      ) : media.isError ? (
        <ErrorState compact error={media.error} onRetry={() => media.refetch()} />
      ) : media.data.length === 0 ? (
        <p className="text-sm text-ink-muted">No images yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-4">
          {media.data.map((m) => (
            <li key={m.id} className="w-44 rounded-lg border border-line p-2 text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt_text ?? `${placementLabel(m.placement)} image`} className="mx-auto max-h-28 rounded" />
              <p className="mt-2 font-semibold">{placementLabel(m.placement)}</p>
              {m.alt_text ? <p className="text-ink-muted">{m.alt_text}</p> : <p className="font-semibold text-warning-text">No description</p>}
              <button type="button" onClick={() => setRemoving(m)} className="mt-1 inline-flex min-h-[36px] items-center gap-1 font-semibold text-error-text hover:underline">
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove<span className="sr-only"> image for {placementLabel(m.placement)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={upload} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Where it goes">
          {(p) => (
            <select {...p} value={placement} onChange={(e) => setPlacement(e.target.value as MediaPlacement)} className={inputClass}>
              {PLACEMENTS.map((x) => (
                <option key={x} value={x}>
                  {placementLabel(x)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Describe the image" help="Read aloud to students who cannot see it.">
          {(p) => <input {...p} value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Image file" error={fileError} help="PNG, JPEG or WebP, up to 5 MB.">
          {(p) => <input {...p} id="media-file" type="file" accept={TYPES.join(",")} onChange={(e) => pick(e.target.files?.[0] ?? null)} className={`${inputClass} py-2`} />}
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={!file || !!fileError} loading={addMedia.isPending} icon={<ImagePlus className="h-4 w-4" aria-hidden />}>
            Add image
          </Button>
        </div>
      </form>
      {addMedia.error ? <ErrorState compact error={addMedia.error} /> : null}

      <ConfirmDialog
        open={!!removing}
        title="Remove this image?"
        confirmLabel="Remove"
        danger
        busy={deleteMedia.isPending}
        error={deleteMedia.error}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await deleteMedia.mutateAsync({ id: questionId, mediaId: removing.id });
            setRemoving(null);
          } catch {}
        }}
        onCancel={() => {
          deleteMedia.reset();
          setRemoving(null);
        }}
      >
        <p>The image is removed from the question. Students will no longer see it.</p>
      </ConfirmDialog>
    </section>
  );
}
