import { Suspense } from "react";
import TestsScreen from "@/components/tests/TestsScreen";

export const metadata = { title: "Tests" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TestsScreen />
    </Suspense>
  );
}
