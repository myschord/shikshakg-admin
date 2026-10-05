import { Suspense } from "react";
import QuestionList from "@/components/questions/QuestionList";

export const metadata = { title: "Question bank" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QuestionList />
    </Suspense>
  );
}
