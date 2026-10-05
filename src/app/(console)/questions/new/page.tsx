"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "react-toastify";
import QuestionEditor from "@/components/questions/QuestionEditor";

export default function Page() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <Link href="/questions" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Question bank
        </Link>
        <h1 className="text-2xl font-extrabold">New question</h1>
        <p className="mt-1 text-sm text-ink-muted">It is saved as a draft. Students cannot see it until it is reviewed and published.</p>
      </div>
      <QuestionEditor
        mode="create"
        onCancel={() => router.push("/questions")}
        onSaved={(q) => {
          toast.success("Saved as a draft.");
          router.push(`/questions/view?id=${q.id}`);
        }}
      />
    </div>
  );
}
