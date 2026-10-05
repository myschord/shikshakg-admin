"use client";

import { useMemo } from "react";
import { inputClass } from "@/components/kit/Field";
import { useCategories } from "@/lib/hooks/useExamEvents";

/** Every exam, grouped by category. `allLabel` adds an "all exams" choice with an empty value. */
export default function ExamSelect({
  id,
  value,
  onChange,
  allLabel,
  disabled,
  className = "",
  ...aria
}: {
  id?: string;
  value: string;
  onChange: (slug: string) => void;
  allLabel?: string;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
}) {
  const categories = useCategories();
  return (
    <select id={id} value={value} disabled={disabled || categories.isPending} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${className}`} {...aria}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {allLabel === undefined && !value && <option value="">Choose an exam…</option>}
      {(categories.data ?? []).map((c) => (
        <optgroup key={c.slug} label={c.name}>
          {c.exams.map((x) => (
            <option key={x.slug} value={x.slug}>
              {x.short_name || x.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** slug -> display name, for tables. */
export function useExamNames() {
  const categories = useCategories();
  return useMemo(() => new Map((categories.data ?? []).flatMap((c) => c.exams.map((x) => [x.slug, x.short_name || x.name] as const))), [categories.data]);
}
