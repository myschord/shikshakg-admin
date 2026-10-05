"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BlueprintsTab from "@/components/catalog/BlueprintsTab";
import ExamsTab from "@/components/catalog/ExamsTab";
import SyllabusTab from "@/components/catalog/SyllabusTab";
import TaxonomyTab from "@/components/catalog/TaxonomyTab";

const TABS = [
  { id: "exams", label: "Exams and stages" },
  { id: "syllabus", label: "Syllabus" },
  { id: "topics", label: "Subjects and topics" },
  { id: "blueprints", label: "Blueprints" },
] as const;

/** Everything students pick from: exams, their stages, the syllabus of each stage, the topic tree and the shape of full tests. */
export default function CatalogScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useSearchParams().get("tab");
  const tab = TABS.find((x) => x.id === t)?.id ?? "exams";
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Catalog</h1>
        <p className="mt-1 text-sm text-ink-muted">Changes here show to students straight away. Short codes cannot be changed once created, and nothing can be deleted.</p>
      </div>
      <div role="tablist" aria-label="Catalog" className="flex flex-wrap gap-2 border-b border-line">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`panel-${x.id}`} onClick={() => router.replace(`${pathname}?tab=${x.id}`, { scroll: false })} className={`-mb-px min-h-[48px] border-b-2 px-4 text-sm font-semibold ${tab === x.id ? "border-primary text-primary-dark" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "exams" ? <ExamsTab /> : tab === "syllabus" ? <SyllabusTab /> : tab === "topics" ? <TaxonomyTab /> : <BlueprintsTab />}
      </div>
    </div>
  );
}
