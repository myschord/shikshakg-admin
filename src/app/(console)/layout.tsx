"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import Shell from "@/components/shell/Shell";
import { roleLabel } from "@/lib/api/auth";
import { signOutState, useAuth } from "@/lib/auth/AuthContext";
import { rolesFor } from "@/lib/nav";

/** Everything inside needs a staff session. Pages that only some roles may open refuse the others even on a direct link. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(pathname === "/" || signOutState.active ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, pathname, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
      </div>
    );
  }

  const allowed = rolesFor(pathname);
  if (allowed && !allowed.includes(user.role)) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg rounded-2xl border border-line bg-white p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-border-tint text-primary-dark">
            <Lock className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-bold">Your role cannot open this page</h1>
          <p className="mt-2 text-sm text-ink-muted">
            This area is for {allowed.map(roleLabel).join(" and ").toLowerCase()} accounts. You are signed in as a {roleLabel(user.role).toLowerCase()}. Ask an administrator if you need access.
          </p>
          <Link href="/" className="mt-5 inline-flex min-h-[44px] items-center font-semibold text-primary hover:underline">
            Back to Today
          </Link>
        </div>
      </Shell>
    );
  }
  return <Shell>{children}</Shell>;
}
