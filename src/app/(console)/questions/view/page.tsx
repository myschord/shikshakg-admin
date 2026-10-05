import { Suspense } from "react";
import QuestionView from "@/components/questions/QuestionView";

export const metadata = { title: "Question" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QuestionView />
    </Suspense>
  );
}
