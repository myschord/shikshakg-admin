"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import Button from "@/components/kit/Button";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { NotStaffError, useAuth } from "@/lib/auth/AuthContext";

/** Only paths inside the console may be a sign-in destination. */
const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") && n !== "/login" ? n : "/");

function LoginForm() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">ShikshakG staff console</h1>
        <p className="mt-1 text-sm text-ink-muted">Sign in with your staff account. Accounts are created by an administrator.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm" noValidate>
        <Field label="Email" required>
          {(p) => <input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Password" required>
          {(p) => <input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />}
        </Field>
        {error ? (
          <ErrorState compact error={error instanceof NotStaffError ? error : error} />
        ) : null}
        <Button type="submit" className="w-full" loading={busy} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-ink-muted">Students: use the main ShikshakG website instead.</p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
