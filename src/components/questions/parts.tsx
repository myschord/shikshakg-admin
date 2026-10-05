import { Check, Image as ImageIcon } from "lucide-react";
import Badge from "@/components/kit/Badge";
import { LANG_LABEL, STATUS_LABEL, type AdminQuestion, type QuestionStatus } from "@/lib/api/questions";

const TONE = { draft: "neutral", in_review: "warning", published: "success", rejected: "danger", retired: "neutral" } as const;

export const StatusBadge = ({ status }: { status: string }) => <Badge tone={TONE[status as QuestionStatus] ?? "neutral"}>{STATUS_LABEL[status as QuestionStatus] ?? status}</Badge>;

/** The first line of a question for lists, in the first language it has. */
export const stemPreview = (q: AdminQuestion, max = 110) => {
  const t = q.translations.find((x) => x.language === "en") ?? q.translations[0];
  const s = (t?.stem ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s || "(no text)";
};

/** What a student would see: every language side by side, the key marked, and the explanation. */
export function QuestionPreview({ q, mediaCount = 0 }: { q: AdminQuestion; mediaCount?: number }) {
  const langs = q.translations;
  return (
    <div className={`grid gap-4 ${langs.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {langs.map((t) => {
        const keys = Object.keys(t.options).sort();
        return (
          <section key={t.language} lang={t.language} aria-label={LANG_LABEL[t.language] ?? t.language} className="rounded-xl border border-line bg-white p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">{LANG_LABEL[t.language] ?? t.language}</p>
            <p className="whitespace-pre-line text-[15px] font-medium leading-relaxed">{t.stem}</p>
            <ul className="mt-3 space-y-2">
              {keys.map((k) => {
                const correct = q.correct_options.includes(k);
                return (
                  <li key={k} className={`flex items-start gap-3 rounded-lg border p-2.5 text-sm ${correct ? "border-success bg-success/10" : "border-line"}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${correct ? "bg-success-fill text-white" : "bg-bg-tint text-primary-dark"}`}>{k}</span>
                    <span className="min-w-0 flex-1 whitespace-pre-line">{t.options[k]}</span>
                    {correct && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success-text">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Correct answer
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {t.explanation && (
              <div className="mt-3 rounded-lg bg-bg-tint px-3 py-2 text-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Explanation</p>
                <p className="mt-0.5 whitespace-pre-line">{t.explanation}</p>
              </div>
            )}
          </section>
        );
      })}
      {mediaCount > 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-ink-muted lg:col-span-2">
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> {mediaCount} image{mediaCount === 1 ? "" : "s"} attached. Open the question to see them.
        </p>
      )}
    </div>
  );
}

/** Where the question came from and how it is classified. */
export function QuestionFacts({ q, examName }: { q: AdminQuestion; examName: string }) {
  const facts: [string, string][] = [
    ["Exam", `${examName}${q.stage_slug ? ` · ${q.stage_slug}` : ""}`],
    ["Source", q.source_type === "PYQ" ? `PYQ${q.paper_code ? ` · ${q.paper_code}` : ""}${q.question_number ? ` · Q${q.question_number}` : ""}${q.year ? ` · ${q.year}` : ""}` : q.source_type === "AI_GENERATED" ? "AI generated" : "Written by staff"],
    ["Subject", q.subject.name],
    ["Topic", q.topic?.name ?? "Not classified"],
    ["Subtopic", q.subtopic?.name ?? "None"],
    ["Difficulty", q.difficulty],
    ["Pattern", q.pattern === "multi_correct_mcq" ? "More than one correct" : "One correct"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
      {facts.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</dt>
          <dd className={`font-medium ${k === "Topic" && !q.topic ? "text-warning-text" : ""}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
