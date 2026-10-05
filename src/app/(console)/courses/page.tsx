import { Suspense } from "react";
import CoursesScreen from "@/components/courses/CoursesScreen";

export const metadata = { title: "Courses" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CoursesScreen />
    </Suspense>
  );
}
