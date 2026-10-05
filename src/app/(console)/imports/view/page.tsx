import { Suspense } from "react";
import ImportJobView from "@/components/imports/ImportJobView";

export const metadata = { title: "Import" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ImportJobView />
    </Suspense>
  );
}
