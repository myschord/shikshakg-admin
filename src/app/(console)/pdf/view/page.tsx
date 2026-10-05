import { Suspense } from "react";
import PdfReview from "@/components/pdf/PdfReview";

export const metadata = { title: "PDF review" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PdfReview />
    </Suspense>
  );
}
