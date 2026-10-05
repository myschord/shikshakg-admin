import { Hammer } from "lucide-react";

/** Placeholder for a console area that is planned but not built. */
export default function ComingSoon({ title, phase, children }: { title: string; phase: string; children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-line bg-white p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-border-tint text-primary-dark">
        <Hammer className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-ink-muted">This screen is planned for phase {phase} of the admin console and is not built yet.</p>
      {children && <div className="mt-3 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}
