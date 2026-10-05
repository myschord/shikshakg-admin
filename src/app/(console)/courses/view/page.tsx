import { Suspense } from "react";
import CourseView from "@/components/courses/CourseView";

export const metadata = { title: "Course" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CourseView />
    </Suspense>
  );
}
