import { Suspense } from "react";
import PapersScreen from "@/components/papers/PapersScreen";

export const metadata = { title: "Papers" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PapersScreen />
    </Suspense>
  );
}
