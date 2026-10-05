"use client";

import { useMemo, useState } from "react";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { ORDER_STATUS_LABEL, rupees, type Order } from "@/lib/api/commerce";
import { checkedLabel, istDay, formatDay } from "@/lib/date";
import { useOrders } from "@/lib/hooks/useCommerce";

const tone = (s: string) => (s === "paid" ? "success" : s === "failed" || s === "expired" || s === "cancelled" ? "neutral" : s.includes("refund") ? "info" : "warning");

/** Orders, read only. Search by the student's email; open one to see what was charged. */
export default function OrdersTab() {
  const [email, setEmail] = useState("");
  const [applied, setApplied] = useState("");
  const [status, setStatus] = useState("");
  const list = useOrders({ email: applied || undefined, status: status || undefined });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const [open, setOpen] = useState<Order | null>(null);

  const columns: Column<Order>[] = [
    { key: "o", header: "Order", cell: (o) => <span className="font-mono text-xs">{o.id.slice(0, 8)}</span> },
    { key: "u", header: "Student", cell: (o) => <span className="break-all">{o.user_email}</span> },
    { key: "i", header: "Bought", cell: (o) => o.items.map((i) => i.product_title).join(", ") },
    { key: "t", header: "Total", align: "right", cell: (o) => <span className="whitespace-nowrap font-semibold">{rupees(o.total_amount)}</span> },
    { key: "s", header: "State", cell: (o) => <Badge tone={tone(o.status)}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</Badge> },
    { key: "d", header: "Placed", cell: (o) => <span className="whitespace-nowrap">{formatDay(istDay(o.created_at))}</span> },
    {
      key: "a",
      header: "Details",
      cell: (o) => (
        <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setOpen(o)}>
          Open<span className="sr-only"> order {o.id.slice(0, 8)}</span>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(email.trim());
        }}
      >
        <Field label="Student email" className="min-w-[16rem] flex-1">{(p) => <input {...p} type="search" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />}</Field>
        <Field label="State" className="min-w-[12rem]">
          {(p) => (
            <select {...p} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">All</option>
              {Object.entries(ORDER_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : <DataTable caption="Orders" columns={columns} rows={rows} rowKey={(o) => o.id} loading={list.isPending} empty={<p className="font-semibold text-ink">No orders match</p>} />}
      {list.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
      <Dialog open={!!open} title="Order" onClose={() => setOpen(null)} wide>
        {open && (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Row k="Order" v={<span className="break-all font-mono text-xs">{open.id}</span>} />
              <Row k="State" v={ORDER_STATUS_LABEL[open.status] ?? open.status} />
              <Row k="Student" v={<span className="break-all">{open.user_email}</span>} />
              <Row k="Placed" v={checkedLabel(open.created_at).replace(/ \(.*\)$/, "")} />
              <Row k="Paid" v={open.paid_at ? checkedLabel(open.paid_at).replace(/ \(.*\)$/, "") : "Not paid"} />
              <Row k="Razorpay order" v={<span className="break-all font-mono text-xs">{open.razorpay_order_id ?? "none"}</span>} />
            </dl>
            <table className="w-full text-left">
              <caption className="sr-only">Items in this order</caption>
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th scope="col" className="py-2 pr-2 font-semibold">Item</th>
                  <th scope="col" className="py-2 pr-2 text-right font-semibold">Price</th>
                  <th scope="col" className="py-2 pr-2 text-right font-semibold">Discount</th>
                  <th scope="col" className="py-2 pr-2 text-right font-semibold">Credit</th>
                  <th scope="col" className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {open.items.map((i) => (
                  <tr key={i.product_code} className="border-b border-line">
                    <td className="py-2 pr-2">
                      {i.product_title}
                      <span className="block font-mono text-xs text-ink-muted">{i.product_code}</span>
                    </td>
                    <td className="py-2 pr-2 text-right">{rupees(i.unit_price)}</td>
                    <td className="py-2 pr-2 text-right">{rupees(i.discount)}</td>
                    <td className="py-2 pr-2 text-right">{rupees(i.upgrade_credit)}</td>
                    <td className="py-2 text-right font-semibold">{rupees(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right">
              Total <strong>{rupees(open.total_amount)}</strong>, of which GST {rupees(open.tax_total)}
            </p>
            <div className="text-right">
              <Button variant="secondary" onClick={() => setOpen(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-semibold text-ink-muted">{k}</dt>
    <dd>{v}</dd>
  </div>
);
