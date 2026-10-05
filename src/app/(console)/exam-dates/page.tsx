import { Suspense } from "react";
import ExamDatesScreen from "@/components/examdates/ExamDatesScreen";

export const metadata = { title: "Exam dates" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ExamDatesScreen />
    </Suspense>
  );
}
