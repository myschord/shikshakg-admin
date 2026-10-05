"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { MONEY } from "@/components/commerce/ProductsTab";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { ENTITLEMENT_LABEL, GRANT_SOURCE_LABEL, REFUND_STATUS_LABEL, rupees, type Entitlement, type Refund } from "@/lib/api/commerce";
import { formatDay, istDay } from "@/lib/date";
import { useCommerceMutations, useEntitlements, useProducts, useRefunds } from "@/lib/hooks/useCommerce";

const day = (iso: string | null) => (iso ? formatDay(istDay(iso)) : "");

/** Refund requests from students. Processing sends money back through Razorpay and cannot be undone. */
export function RefundsTab() {
  const [status, setStatus] = useState("requested");
  const list = useRefunds(status);
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const [act, setAct] = useState<{ kind: "process" | "reject"; refund: Refund } | null>(null);

  const columns: Column<Refund>[] = [
    { key: "o", header: "Order", cell: (r) => <span className="font-mono text-xs">{r.order_id.slice(0, 8)}</span> },
    { key: "a", header: "Amount", align: "right", cell: (r) => <span className="whitespace-nowrap font-semibold">{rupees(r.amount)}</span> },
    { key: "r", header: "Reason given", cell: (r) => <span className="whitespace-pre-wrap break-words">{r.reason}</span> },
    { key: "s", header: "State", cell: (r) => <Badge tone={r.status === "processed" ? "success" : r.status === "failed" ? "neutral" : "warning"}>{REFUND_STATUS_LABEL[r.status] ?? r.status}</Badge> },
    { key: "d", header: "Asked", cell: (r) => <span className="whitespace-nowrap">{day(r.created_at)}</span> },
    { key: "n", header: "Note", cell: (r) => r.note ?? "" },
    {
      key: "x",
      header: "Decide",
      cell: (r) =>
        r.status === "requested" ? (
          <div className="flex flex-wrap gap-2">
            <Button className="!min-h-[36px] !px-3" onClick={() => setAct({ kind: "process", refund: r })}>
              Refund<span className="sr-only"> order {r.order_id.slice(0, 8)}</span>
            </Button>
            <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setAct({ kind: "reject", refund: r })}>
              Reject<span className="sr-only"> order {r.order_id.slice(0, 8)}</span>
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <Field label="Show" className="max-w-xs">
        {(p) => (
          <select {...p} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {Object.entries(REFUND_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        )}
      </Field>
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : <DataTable caption="Refund requests" columns={columns} rows={rows} rowKey={(r) => r.id} loading={list.isPending} empty={<p className="font-semibold text-ink">No refund requests here</p>} />}
      {list.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
      <RefundDialog act={act} onClose={() => setAct(null)} />
    </div>
  );
}

function RefundDialog({ act, onClose }: { act: { kind: "process" | "reject"; refund: Refund } | null; onClose: () => void }) {
  const { processRefund, rejectRefund } = useCommerceMutations();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!act) return;
    setAmount("");
    setNote("");
    setErrors({});
    processRefund.reset();
    rejectRefund.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);
  if (!act) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;
  const process = act.kind === "process";
  const mut = process ? processRefund : rejectRefund;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (process && amount && (!MONEY.test(amount) || Number(amount) <= 0)) err.amount = "Enter an amount like 250 or 250.50, or leave it empty.";
    if (!process && !note.trim()) err.note = "Tell the student why it was turned down.";
    setErrors(err);
    if (Object.keys(err).length || !act) return;
    try {
      if (process) await processRefund.mutateAsync({ id: act.refund.id, amount: amount || null, note: note.trim() || null });
      else await rejectRefund.mutateAsync({ id: act.refund.id, note: note.trim() });
      toast.success(process ? "Refund sent." : "Refund turned down.");
      onClose();
    } catch {}
  }

  return (
    <Dialog open title={process ? "Refund this order" : "Turn down this refund"} onClose={onClose} busy={mut.isPending} role="alertdialog">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="rounded-lg bg-bg-tint px-3 py-2 text-sm">
          Order <span className="font-mono">{act.refund.order_id.slice(0, 8)}</span>, asked for {rupees(act.refund.amount)}. Reason: {act.refund.reason}
        </p>
        {process ? (
          <>
            <p className="text-sm font-semibold text-error-text">This sends the money back to the student through Razorpay. It cannot be undone. A full refund also takes away the access they bought.</p>
            <Field label="Amount to refund (₹)" error={errors.amount} help="Leave empty to refund everything that is left on the payment.">{(p) => <input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />}</Field>
            <Field label="Note (optional)">{(p) => <input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputClass} />}</Field>
          </>
        ) : (
          <Field label="Reason for turning it down" required error={errors.note}>{(p) => <textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className={`${inputClass} py-2`} />}</Field>
        )}
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant={process ? "danger" : "primary"} loading={mut.isPending}>
            {process ? "Send refund" : "Turn down"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const ETONE = (s: string) => (s === "active" ? "success" : s === "refunded" || s === "revoked" ? "warning" : "neutral");

/** Who has access to what. Staff can give access (support, goodwill, trial) or take it away. */
export function AccessTab() {
  const [email, setEmail] = useState("");
  const [applied, setApplied] = useState("");
  const [exam, setExam] = useState("");
  const list = useEntitlements({ email: applied || undefined, exam: exam || undefined });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<Entitlement | null>(null);

  const columns: Column<Entitlement>[] = [
    { key: "u", header: "Student", cell: (e) => <span className="break-all">{e.user_email}</span> },
    { key: "e", header: "Exam", cell: (e) => e.exam_name },
    { key: "t", header: "Access to", cell: (e) => ENTITLEMENT_LABEL[e.entitlement_type] ?? e.entitlement_type },
    { key: "s", header: "State", cell: (e) => <Badge tone={ETONE(e.status)}>{e.status[0].toUpperCase() + e.status.slice(1)}</Badge> },
    { key: "g", header: "How", cell: (e) => (GRANT_SOURCE_LABEL[e.grant_source] ?? e.grant_source) + (e.revoke_reason ? `. Taken away: ${e.revoke_reason}` : "") },
    { key: "x", header: "Ends", cell: (e) => <span className="whitespace-nowrap">{e.expires_at ? day(e.expires_at) : "Never"}</span> },
    {
      key: "a",
      header: "Action",
      cell: (e) =>
        e.status === "active" ? (
          <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setRevoking(e)}>
            Take away<span className="sr-only"> {ENTITLEMENT_LABEL[e.entitlement_type]} access from {e.user_email}</span>
          </Button>
        ) : null,
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
        <Field label="Exam" className="min-w-[14rem]">{(p) => <ExamSelect {...p} allLabel="All exams" value={exam} onChange={setExam} />}</Field>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <Button type="button" onClick={() => setGranting(true)} className="ml-auto">
          Give access
        </Button>
      </form>
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : <DataTable caption="Access" columns={columns} rows={rows} rowKey={(e) => e.id} loading={list.isPending} empty={<p className="font-semibold text-ink">No access records match</p>} />}
      {list.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
      <GrantDialog open={granting} onClose={() => setGranting(false)} />
      <RevokeDialog entitlement={revoking} onClose={() => setRevoking(null)} />
    </div>
  );
}

function GrantDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { grant } = useCommerceMutations();
  const products = useProducts({});
  const items = useMemo(() => (products.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => p.status !== "retired"), [products.data]);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setEmail("");
    setCode("");
    setDays("");
    setReason("");
    setErrors({});
    grant.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) err.email = "Enter the student's email address.";
    if (!code) err.code = "Choose what to give.";
    if (days && !(/^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 3650)) err.days = "Enter a number of days from 1 to 3650, or leave it empty.";
    if (!reason.trim()) err.reason = "Say why access is being given.";
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      await grant.mutateAsync({ user_email: email.trim(), product_code: code, validity_days: days ? Number(days) : null, reason: reason.trim() });
      toast.success("Access given.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open={open} title="Give access" onClose={onClose} busy={grant.isPending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Student email" required error={errors.email}>{(p) => <input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} className={inputClass} />}</Field>
        <Field label="Give access like buying" required error={errors.code} help="The product decides the exam and what is unlocked.">
          {(p) => (
            <select {...p} value={code} onChange={(e) => setCode(e.target.value)} className={inputClass}>
              <option value="">Choose a product</option>
              {items.map((i) => (
                <option key={i.code} value={i.code}>
                  {i.title} ({i.exam_slug})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Days of access" error={errors.days} help="Leave empty to use the product's own length.">{(p) => <input {...p} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} />}</Field>
        <Field label="Reason" required error={errors.reason} help="Kept in the staff action log.">{(p) => <input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={inputClass} />}</Field>
        {grant.error ? <ErrorState compact error={grant.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={grant.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={grant.isPending}>
            Give access
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RevokeDialog({ entitlement, onClose }: { entitlement: Entitlement | null; onClose: () => void }) {
  const { revoke } = useCommerceMutations();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!entitlement) return;
    setReason("");
    setErr(null);
    revoke.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entitlement]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!entitlement) return;
    if (!reason.trim()) return setErr("Say why access is being taken away.");
    setErr(null);
    try {
      await revoke.mutateAsync({ id: entitlement.id, reason: reason.trim() });
      toast.success("Access taken away.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open={!!entitlement} title="Take away access" onClose={onClose} busy={revoke.isPending} role="alertdialog">
      {entitlement && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <p className="rounded-lg bg-bg-tint px-3 py-2 text-sm">
            {ENTITLEMENT_LABEL[entitlement.entitlement_type]} for {entitlement.exam_name}, held by <strong className="break-all">{entitlement.user_email}</strong>. They lose it straight away.
          </p>
          <Field label="Reason" required error={err} help="Kept in the staff action log.">{(p) => <input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={inputClass} />}</Field>
          {revoke.error ? <ErrorState compact error={revoke.error} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={revoke.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={revoke.isPending}>
              Take away access
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
