"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccessTab, RefundsTab } from "@/components/commerce/MoneyTabs";
import OrdersTab from "@/components/commerce/OrdersTab";
import ProductsTab from "@/components/commerce/ProductsTab";

const TABS = [
  { id: "products", label: "Products and prices" },
  { id: "orders", label: "Orders" },
  { id: "refunds", label: "Refunds" },
  { id: "access", label: "Access" },
] as const;

/** Money matters: what is sold, what was bought, refunds, and who has access. Admin role only. */
export default function CommerceScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useSearchParams().get("tab");
  const tab = TABS.find((x) => x.id === t)?.id ?? "products";
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Commerce</h1>
        <p className="mt-1 text-sm text-ink-muted">Products and prices, orders, refund requests and who has access to what.</p>
      </div>
      <div role="tablist" aria-label="Commerce" className="flex flex-wrap gap-2 border-b border-line">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`panel-${x.id}`} onClick={() => router.replace(`${pathname}?tab=${x.id}`, { scroll: false })} className={`-mb-px min-h-[48px] border-b-2 px-4 text-sm font-semibold ${tab === x.id ? "border-primary text-primary-dark" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "products" ? <ProductsTab /> : tab === "orders" ? <OrdersTab /> : tab === "refunds" ? <RefundsTab /> : <AccessTab />}
      </div>
    </div>
  );
}
