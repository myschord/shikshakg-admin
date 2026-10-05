import { Suspense } from "react";
import CommerceScreen from "@/components/commerce/CommerceScreen";

export const metadata = { title: "Commerce" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CommerceScreen />
    </Suspense>
  );
}
