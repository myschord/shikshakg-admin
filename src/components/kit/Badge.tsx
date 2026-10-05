type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink-muted",
  info: "bg-border-tint text-primary-dark",
  success: "bg-success/10 text-success-text",
  warning: "bg-warning/15 text-warning-text",
  danger: "bg-error/10 text-error-text",
};

/** A short status label. Colour is never the only signal: the text always says the state. */
export default function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}
