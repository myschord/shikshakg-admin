import { Suspense } from "react";
import TestView from "@/components/tests/TestView";

export const metadata = { title: "Test" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TestView />
    </Suspense>
  );
}
