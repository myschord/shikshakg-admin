import { api } from "./client";
import type { components } from "./schema";

type S = components["schemas"];

export type Policy = Omit<S["PolicyOut"], "values"> & { values: PolicyValues };
export type PolicyValues = S["PolicyValues"];
export type Suspicious = S["SuspiciousQuestionOut"];

type Base = { key: keyof PolicyValues; label: string; help?: string };
export type FieldSpec =
  | (Base & { kind: "int"; min: number; max?: number })
  | (Base & { kind: "float"; min: number; max: number; step?: number })
  | (Base & { kind: "money" })
  | (Base & { kind: "bool" })
  | (Base & { kind: "text"; max?: number; pattern?: RegExp; patternHelp?: string })
  | (Base & { kind: "nullfloat"; offLabel: string })
  | (Base & { kind: "nulltext"; max: number; offLabel: string });

export type Group = { id: string; title: string; intro: string; fields: FieldSpec[] };

// Every setting the backend accepts, in plain words. Ranges match the backend's own limits, so a value that the
// page accepts is one the server accepts.
export const GROUPS: Group[] = [
  {
    id: "limits",
    title: "Limits for students",
    intro: "How much AI help a student gets. One unit is one AI practice-test request.",
    fields: [
      { key: "free_monthly_units", label: "Free requests per month", kind: "int", min: 0, help: "For students who have not bought the exam." },
      { key: "exam_daily_units", label: "Requests per day for the exam", kind: "int", min: 0 },
      { key: "free_explanations_daily", label: "Free explanations per day", kind: "int", min: 0, help: "Students who bought the exam get unlimited explanations." },
    ],
  },
  {
    id: "practice",
    title: "Practice tests",
    intro: "How practice tests are put together from the question bank.",
    fields: [
      { key: "max_questions_per_request", label: "Most questions in one request", kind: "int", min: 1, max: 200 },
      { key: "practice_recent_days", label: "Do not repeat a question seen in the last (days)", kind: "int", min: 0, max: 365 },
      { key: "bank_fill_enabled", label: "Write new questions in the background when the bank has too few", kind: "bool", help: "Off by default: it spends money without a student waiting. New questions go to review." },
      { key: "bank_fill_cooldown_hours", label: "Wait this long before filling the same gap again (hours)", kind: "int", min: 0, max: 720 },
    ],
  },
  {
    id: "generation",
    title: "Writing new questions",
    intro: "Limits and settings for each AI job.",
    fields: [
      { key: "max_repair_attempts", label: "Repair attempts for a bad question", kind: "int", min: 0, max: 3 },
      { key: "max_job_output_tokens", label: "Most output tokens in one job", kind: "int", min: 1 },
      { key: "max_job_cost_usd", label: "Most cost of one job (US dollars)", kind: "money" },
      { key: "generation_temperature", label: "Creativity (0 to 1)", kind: "float", min: 0, max: 1, step: 0.05, help: "Lower is steadier, higher is more varied." },
      { key: "generation_max_tokens", label: "Most tokens per question", kind: "int", min: 256, max: 8192 },
    ],
  },
  {
    id: "quality",
    title: "Quality checks",
    intro: "Checks a written question must pass. A similarity limit left unmeasured stops generated questions from publishing themselves.",
    fields: [
      { key: "solve_check_enabled", label: "Solve each question again to confirm its answer", kind: "bool" },
      { key: "scope_check_enabled", label: "Check the question is about its topic", kind: "bool" },
      { key: "critic_enabled", label: "Ask a second AI pass to criticise each question", kind: "bool" },
      { key: "stem_overlap_max", label: "Most words shared with the source question (0 to 1)", kind: "float", min: 0.01, max: 1, step: 0.05 },
      { key: "dup_threshold", label: "Too similar to an existing question at (0 to 1)", kind: "nullfloat", offLabel: "Not measured yet" },
      { key: "pyq_similarity_threshold", label: "Too similar to a past-paper question at (0 to 1)", kind: "nullfloat", offLabel: "Not measured yet" },
      { key: "paraphrase_threshold", label: "Counts as a paraphrase at (0 to 1)", kind: "nullfloat", offLabel: "Not measured yet" },
    ],
  },
  {
    id: "publishing",
    title: "Publishing",
    intro: "What happens to a question after it passes the checks.",
    fields: [
      { key: "auto_publish", label: "Publish generated questions without review", kind: "bool", help: "Off means every generated question waits in the review queue." },
      { key: "sampling_review_rate", label: "Share of questions a person still reviews (0 to 1)", kind: "float", min: 0, max: 1, step: 0.05, help: "1 means all of them." },
    ],
  },
  {
    id: "grounding",
    title: "Source text",
    intro: "Where the AI reads before it writes, so questions rest on real text.",
    fields: [
      { key: "grounding_provider", label: "Source", kind: "text", max: 40, pattern: /^[a-z_]+$/, patternHelp: "Use lowercase letters and underscores." },
      { key: "grounding_context_chars", label: "Characters of source text to read", kind: "int", min: 500, max: 20000 },
      { key: "grounding_query_suffix", label: "Words added to every search", kind: "text", max: 40 },
      { key: "grounding_required_term", label: "A word the source must mention", kind: "nulltext", max: 40, offLabel: "No required word" },
      { key: "grounding_min_term_hits", label: "How many times it must appear", kind: "int", min: 1, max: 50 },
    ],
  },
];

export const ALL_FIELDS: FieldSpec[] = GROUPS.flatMap((g) => g.fields);

// Admin only. The backend answers with the version in force: a built-in default (version 0) until someone saves one.
export const aiApi = {
  policy: () => api.get<Policy>("/admin/ai/policy"),
  publish: (values: PolicyValues, note: string | null) => api.put<Policy>("/admin/ai/policy", { exam_id: null, values, note }),
  suspicious: (limit: number) => api.get<Suspicious[]>("/admin/analytics/suspicious-questions", { query: { limit } }),
};
