"use client";

import { Skeleton } from "@/components/ui/Skeleton";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Right-align numbers and dates. */
  align?: "left" | "right";
  className?: string;
};

/**
 * A plain data table: a caption for screen readers, real column headers, a loading skeleton and an empty
 * message. Wide tables scroll sideways inside a focusable region instead of breaking the page.
 */
export default function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  rowClassName,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  empty: React.ReactNode;
  rowClassName?: (row: T) => string;
}) {
  if (loading) return <Skeleton className="h-48" />;
  if (!rows || rows.length === 0) return <div className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">{empty}</div>;
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="relative overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-bg-tint text-left text-xs uppercase tracking-wide text-ink-muted">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-3 font-semibold ${c.align === "right" ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className={`border-t border-line align-top ${rowClassName?.(r) ?? ""}`}>
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
