"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import ConfirmDialog from "@/components/kit/ConfirmDialog";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import ExamSelect from "@/components/kit/ExamSelect";
import Field, { inputClass } from "@/components/kit/Field";
import { PRODUCT_STATUS_LABEL, PRODUCT_TYPES, rupees, type Product, type ProductType } from "@/lib/api/commerce";
import { formatDay, fromIstLocalInput, toIstLocalInput } from "@/lib/date";
import { useCategories } from "@/lib/hooks/useExamEvents";
import { useCommerceMutations, useProducts } from "@/lib/hooks/useCommerce";

export const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const CODE = /^[A-Z0-9]+(_[A-Z0-9]+)*$/;
const tone = (s: string) => (s === "active" ? "success" : s === "retired" ? "neutral" : "warning");

/** What is for sale. A price is never edited; a new price starts on a date and closes the one before it. */
export default function ProductsTab() {
  const [exam, setExam] = useState("");
  const [status, setStatus] = useState("");
  const list = useProducts({ exam: exam || undefined, status: status || undefined });
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const m = useCommerceMutations();
  const [form, setForm] = useState<{ product?: Product } | null>(null);
  const [price, setPrice] = useState<Product | null>(null);
  const [change, setChange] = useState<{ product: Product; status: "active" | "retired" } | null>(null);

  const columns: Column<Product>[] = [
    {
      key: "p",
      header: "Product",
      cell: (p) => (
        <>
          <span className="font-semibold">{p.title}</span>
          <span className="block font-mono text-xs text-ink-muted">{p.code}</span>
        </>
      ),
    },
    { key: "e", header: "Exam", cell: (p) => p.exam_slug },
    { key: "t", header: "Gives access to", cell: (p) => p.components.map((c) => (c.entitlement_type === "COURSE_ACCESS" ? "Courses" : "Test series")).join(" and ") },
    {
      key: "pr",
      header: "Price",
      cell: (p) => (
        <span className="whitespace-nowrap">
          <strong>{rupees(p.price)}</strong>
          {p.list_price && Number(p.list_price) > Number(p.price) ? <span className="ml-1 text-xs text-ink-muted line-through">{rupees(p.list_price)}</span> : null}
          <span className="block text-xs text-ink-muted">GST {Number(p.gst_rate)}%</span>
        </span>
      ),
    },
    { key: "v", header: "Lasts", cell: (p) => (p.validity_type === "FIXED_DAYS" ? `${p.validity_days} days` : `Until ${p.valid_until ? formatDay(p.valid_until) : ""}`) },
    { key: "s", header: "State", cell: (p) => <Badge tone={tone(p.status)}>{PRODUCT_STATUS_LABEL[p.status] ?? p.status}</Badge> },
    {
      key: "a",
      header: "Actions",
      cell: (p) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setForm({ product: p })}>
            Edit<span className="sr-only"> {p.title}</span>
          </Button>
          <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setPrice(p)}>
            Change price<span className="sr-only"> of {p.title}</span>
          </Button>
          {p.status !== "active" && (
            <Button className="!min-h-[36px] !px-3" onClick={() => setChange({ product: p, status: "active" })}>
              Put on sale<span className="sr-only"> {p.title}</span>
            </Button>
          )}
          {p.status !== "retired" && (
            <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setChange({ product: p, status: "retired" })}>
              Retire<span className="sr-only"> {p.title}</span>
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Exam" className="min-w-[14rem]">{(p) => <ExamSelect {...p} allLabel="All exams" value={exam} onChange={setExam} />}</Field>
        <Field label="State" className="min-w-[10rem]">
          {(p) => (
            <select {...p} value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              <option value="">All</option>
              {Object.entries(PRODUCT_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button onClick={() => setForm({})} icon={<Plus className="h-4 w-4" aria-hidden />} className="ml-auto">
          New product
        </Button>
      </div>
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : <DataTable caption="Products" columns={columns} rows={rows} rowKey={(p) => p.id} loading={list.isPending} empty={<><p className="font-semibold text-ink">No products yet</p><p className="mt-1">Create one so students can buy access to an exam.</p></>} />}
      {list.hasNextPage && (
        <div className="text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      )}
      <ProductForm open={!!form} product={form?.product} defaultExam={exam} onClose={() => setForm(null)} />
      <PriceDialog product={price} onClose={() => setPrice(null)} />
      <ConfirmDialog
        open={!!change}
        title={change?.status === "active" ? "Put this product on sale?" : "Retire this product?"}
        confirmLabel={change?.status === "active" ? "Put on sale" : "Retire"}
        danger={change?.status === "retired"}
        busy={m.updateProduct.isPending}
        error={m.updateProduct.error}
        onCancel={() => {
          m.updateProduct.reset();
          setChange(null);
        }}
        onConfirm={async () => {
          if (!change) return;
          try {
            await m.updateProduct.mutateAsync({ code: change.product.code, body: { status: change.status } });
            toast.success(change.status === "active" ? "Product is on sale." : "Product retired.");
            setChange(null);
          } catch {}
        }}
      >
        {change && (
          <>
            <p className="rounded-lg bg-bg-tint px-3 py-2 text-ink">
              <strong>{change.product.title}</strong> at {rupees(change.product.price)}
            </p>
            {change.status === "active" ? <p>Students can then buy it at this price.</p> : <p>Students can no longer buy it. Access already bought stays.</p>}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

function ProductForm({ open, product, defaultExam, onClose }: { open: boolean; product?: Product; defaultExam: string; onClose: () => void }) {
  const edit = !!product;
  const categories = useCategories();
  const { createProduct, updateProduct } = useCommerceMutations();
  const [exam, setExam] = useState("");
  const [type, setType] = useState<ProductType>("COURSE");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lasts, setLasts] = useState<"FIXED_DAYS" | "FIXED_END_DATE">("FIXED_DAYS");
  const [days, setDays] = useState("365");
  const [until, setUntil] = useState("");
  const [amount, setAmount] = useState("");
  const [listAmount, setListAmount] = useState("");
  const [gst, setGst] = useState("18");
  const [order, setOrder] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const examValue = exam || defaultExam || categories.data?.[0]?.exams[0]?.slug || "";

  useEffect(() => {
    if (!open) return;
    setErrors({});
    createProduct.reset();
    updateProduct.reset();
    setTitle(product?.title ?? "");
    setDescription(product?.description ?? "");
    setOrder(String(product?.display_order ?? 0));
    if (!product) {
      setExam("");
      setType("COURSE");
      setCode("");
      setLasts("FIXED_DAYS");
      setDays("365");
      setUntil("");
      setAmount("");
      setListAmount("");
      setGst("18");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!title.trim()) err.title = "Enter a title.";
    if (!/^-?\d+$/.test(order)) err.order = "Enter a whole number.";
    if (!edit) {
      if (!CODE.test(code)) err.code = "Use capital letters and digits, joined with underscores, for example BPSC_COURSE_1Y.";
      if (!MONEY.test(amount)) err.amount = "Enter an amount like 499 or 499.50.";
      if (listAmount && !MONEY.test(listAmount)) err.list = "Enter an amount like 999 or leave it empty.";
      else if (listAmount && MONEY.test(amount) && Number(listAmount) < Number(amount)) err.list = "The crossed-out price must be at least the price.";
      if (!/^\d+(\.\d{1,2})?$/.test(gst) || Number(gst) > 100) err.gst = "Enter a percentage from 0 to 100.";
      if (lasts === "FIXED_DAYS" && !(Number(days) >= 1 && Number(days) <= 3650 && /^\d+$/.test(days))) err.days = "Enter a number of days from 1 to 3650.";
      if (lasts === "FIXED_END_DATE" && !until) err.until = "Choose the last day of access.";
    }
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      if (edit) {
        await updateProduct.mutateAsync({ code: product!.code, body: { title: title.trim(), description: description.trim() || null, display_order: Number(order) } as never });
        toast.success("Saved.");
      } else {
        await createProduct.mutateAsync({
          code,
          exam_slug: examValue,
          product_type: type,
          title: title.trim(),
          description: description.trim() || null,
          validity_type: lasts,
          validity_days: lasts === "FIXED_DAYS" ? Number(days) : null,
          valid_until: lasts === "FIXED_END_DATE" ? fromIstLocalInput(`${until}T23:59`) : null,
          display_order: Number(order),
          components: type === "COMBO" ? [{ entitlement_type: "COURSE_ACCESS" }, { entitlement_type: "TEST_SERIES_ACCESS" }] : [{ entitlement_type: type === "COURSE" ? "COURSE_ACCESS" : "TEST_SERIES_ACCESS" }],
          amount,
          list_amount: listAmount || null,
          gst_rate: gst,
        });
        toast.success("Product created. It is a draft until you put it on sale.");
      }
      onClose();
    } catch {}
  }

  const mut = edit ? updateProduct : createProduct;
  return (
    <Dialog open={open} title={edit ? "Edit product" : "New product"} onClose={onClose} busy={mut.isPending} wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        {edit ? (
          <p className="rounded-lg bg-bg-tint px-3 py-2 text-sm">
            <span className="font-mono">{product!.code}</span> for {product!.exam_slug}. The code, exam, kind and price are fixed here; use Change price for the price.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Exam" required>{(p) => <ExamSelect {...p} value={examValue} onChange={setExam} />}</Field>
            <Field label="Gives access to" required help={PRODUCT_TYPES.find((t) => t.v === type)?.help}>
              {(p) => (
                <select {...p} value={type} onChange={(e) => setType(e.target.value as ProductType)} className={inputClass}>
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Product code" required error={errors.code} help="Cannot be changed later." className="sm:col-span-2">{(p) => <input {...p} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))} maxLength={64} className={`${inputClass} font-mono`} />}</Field>
          </div>
        )}
        <Field label="Title" required error={errors.title}>{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} />}</Field>
        <Field label="Description">{(p) => <textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={3} className={`${inputClass} py-2`} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Order in the list" error={errors.order} help="Smaller numbers come first.">{(p) => <input {...p} inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} className={inputClass} />}</Field>
          {!edit && (
            <Field label="Access lasts" required>
              {(p) => (
                <select {...p} value={lasts} onChange={(e) => setLasts(e.target.value as typeof lasts)} className={inputClass}>
                  <option value="FIXED_DAYS">A number of days from purchase</option>
                  <option value="FIXED_END_DATE">Until a fixed date</option>
                </select>
              )}
            </Field>
          )}
          {!edit && lasts === "FIXED_DAYS" && <Field label="Days of access" required error={errors.days}>{(p) => <input {...p} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} />}</Field>}
          {!edit && lasts === "FIXED_END_DATE" && <Field label="Last day of access" required error={errors.until} help="India time, end of that day.">{(p) => <input {...p} type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />}</Field>}
          {!edit && (
            <>
              <Field label="Price (₹)" required error={errors.amount} help="What the student pays. GST is already inside this amount.">{(p) => <input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />}</Field>
              <Field label="Crossed-out price (₹)" error={errors.list} help="Optional. Shown struck through.">{(p) => <input {...p} inputMode="decimal" value={listAmount} onChange={(e) => setListAmount(e.target.value)} className={inputClass} />}</Field>
              <Field label="GST (%)" required error={errors.gst}>{(p) => <input {...p} inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} className={inputClass} />}</Field>
            </>
          )}
        </div>
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={mut.isPending}>
            {edit ? "Save changes" : "Create product"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PriceDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { setPrice } = useCommerceMutations();
  const [amount, setAmount] = useState("");
  const [list, setList] = useState("");
  const [gst, setGst] = useState("18");
  const [from, setFrom] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!product) return;
    setAmount("");
    setList(product.list_price ?? "");
    setGst(String(Number(product.gst_rate)));
    setFrom("");
    setErrors({});
    setPrice.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    const err: Record<string, string> = {};
    if (!MONEY.test(amount)) err.amount = "Enter an amount like 499 or 499.50.";
    if (list && !MONEY.test(list)) err.list = "Enter an amount or leave it empty.";
    else if (list && MONEY.test(amount) && Number(list) < Number(amount)) err.list = "The crossed-out price must be at least the price.";
    if (!/^\d+(\.\d{1,2})?$/.test(gst) || Number(gst) > 100) err.gst = "Enter a percentage from 0 to 100.";
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      await setPrice.mutateAsync({ code: product.code, body: { amount, list_amount: list || null, gst_rate: gst, valid_from: from ? fromIstLocalInput(from) : null } });
      toast.success("New price set.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open={!!product} title="Change price" onClose={onClose} busy={setPrice.isPending}>
      {product && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <p className="rounded-lg bg-bg-tint px-3 py-2 text-sm">
            <strong>{product.title}</strong> costs {rupees(product.price)} now{product.price_valid_from ? ` (since ${formatDay(product.price_valid_from)}, ${toIstLocalInput(product.price_valid_from).slice(11)} India time)` : ""}. The old price is kept in the history.
          </p>
          <Field label="New price (₹)" required error={errors.amount} help="What the student pays. GST is already inside it.">{(p) => <input {...p} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />}</Field>
          <Field label="Crossed-out price (₹)" error={errors.list}>{(p) => <input {...p} inputMode="decimal" value={list} onChange={(e) => setList(e.target.value)} className={inputClass} />}</Field>
          <Field label="GST (%)" required error={errors.gst}>{(p) => <input {...p} inputMode="decimal" value={gst} onChange={(e) => setGst(e.target.value)} className={inputClass} />}</Field>
          <Field label="Starts at" help="India time. Leave empty to start now. It must be after the current price started.">{(p) => <input {...p} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />}</Field>
          {setPrice.error ? <ErrorState compact error={setPrice.error} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={setPrice.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={setPrice.isPending}>
              Set new price
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
