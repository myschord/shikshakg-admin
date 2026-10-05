import { Suspense } from "react";
import CatalogScreen from "@/components/catalog/CatalogScreen";

export const metadata = { title: "Catalog" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CatalogScreen />
    </Suspense>
  );
}
