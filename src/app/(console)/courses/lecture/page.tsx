import { Suspense } from "react";
import LectureView from "@/components/courses/LectureView";

export const metadata = { title: "Lecture" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LectureView />
    </Suspense>
  );
}
