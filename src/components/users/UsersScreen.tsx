"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "react-toastify";
import Badge from "@/components/kit/Badge";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Dialog from "@/components/kit/Dialog";
import ErrorState from "@/components/kit/ErrorState";
import Field, { inputClass } from "@/components/kit/Field";
import { ROLE_LABEL, USER_STATUS_LABEL, type Role, type UserRow } from "@/lib/api/a8";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDay, istDay } from "@/lib/date";
import { useUserMutations, useUsers } from "@/lib/hooks/useA8";

const day = (iso: string | null) => (iso ? formatDay(istDay(iso)) : "Never");
const ROLE_HELP: Record<Role, string> = {
  student: "A student: no access to this console.",
  content_editor: "Can manage questions, papers, tests, courses and exam dates. Cannot open Commerce, AI controls or Users.",
  admin: "Full access, including money, AI settings and other people's roles.",
};

/** Find a person, change their role, switch their account off, or add staff. Admin role only. */
export default function UsersScreen() {
  const { user: me } = useAuth();
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [role, setRole] = useState("");
  const list = useUsers({ q: applied || undefined, role: role || undefined });
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);
  const [act, setAct] = useState<{ kind: "role" | "status"; user: UserRow } | null>(null);
  const [inviting, setInviting] = useState(false);

  const columns: Column<UserRow>[] = [
    {
      key: "n",
      header: "Person",
      cell: (u) => (
        <>
          <span className="font-semibold">{u.full_name}</span>
          {u.email === me?.email && <Badge tone="info" className="ml-2">You</Badge>}
          <span className="block break-all text-xs text-ink-muted">{u.email}</span>
        </>
      ),
    },
    { key: "r", header: "Role", cell: (u) => <Badge tone={u.role === "admin" ? "warning" : u.role === "content_editor" ? "info" : "neutral"}>{ROLE_LABEL[u.role]}</Badge> },
    { key: "s", header: "Account", cell: (u) => <Badge tone={u.status === "active" ? "success" : u.status === "suspended" ? "warning" : "neutral"}>{USER_STATUS_LABEL[u.status]}</Badge> },
    { key: "l", header: "Last sign-in", cell: (u) => <span className="whitespace-nowrap">{day(u.last_login_at)}</span> },
    { key: "c", header: "Joined", cell: (u) => <span className="whitespace-nowrap">{day(u.created_at)}</span> },
    {
      key: "a",
      header: "Actions",
      cell: (u) =>
        u.email === me?.email ? (
          <span className="text-xs text-ink-muted">Another administrator changes your account</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="!min-h-[36px] !px-3" onClick={() => setAct({ kind: "role", user: u })}>
              Change role<span className="sr-only"> of {u.full_name}</span>
            </Button>
            {(u.status === "active" || u.status === "suspended") && (
              <Button variant="ghost" className="!min-h-[36px] !px-3" onClick={() => setAct({ kind: "status", user: u })}>
                {u.status === "active" ? "Suspend" : "Restore"}
                <span className="sr-only"> account of {u.full_name}</span>
              </Button>
            )}
          </div>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Users and roles</h1>
          <p className="mt-1 text-sm text-ink-muted">Find someone, change what they can do, or suspend their account. Every change is written to the action log with your reason.</p>
        </div>
        <Button onClick={() => setInviting(true)} icon={<UserPlus className="h-4 w-4" aria-hidden />}>
          Add staff
        </Button>
      </div>
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(q.trim());
        }}
      >
        <Field label="Name or email" className="min-w-[16rem] flex-1">{(p) => <input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} />}</Field>
        <Field label="Role" className="min-w-[12rem]">
          {(p) => (
            <select {...p} value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
              <option value="">Everyone</option>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : <DataTable caption="People" columns={columns} rows={rows} rowKey={(u) => u.id} loading={list.isPending} empty={<p className="font-semibold text-ink">No one matches</p>} />}
      <ActionDialog act={act} onClose={() => setAct(null)} />
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

function ActionDialog({ act, onClose }: { act: { kind: "role" | "status"; user: UserRow } | null; onClose: () => void }) {
  const { setRole, setStatus } = useUserMutations();
  const [role, setRoleValue] = useState<Role>("student");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!act) return;
    setRoleValue(act.user.role);
    setReason("");
    setErr(null);
    setRole.reset();
    setStatus.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);
  if (!act) return <Dialog open={false} title="" onClose={onClose}>{null}</Dialog>;
  const isRole = act.kind === "role";
  const next = act.user.status === "active" ? "suspended" : "active";
  const mut = isRole ? setRole : setStatus;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!act) return;
    if (!reason.trim()) return setErr("Say why. It is kept in the action log.");
    setErr(null);
    try {
      if (isRole) await setRole.mutateAsync({ id: act.user.id, role, reason: reason.trim() });
      else await setStatus.mutateAsync({ id: act.user.id, status: next, reason: reason.trim() });
      toast.success(isRole ? "Role changed." : next === "suspended" ? "Account suspended." : "Account restored.");
      onClose();
    } catch {}
  }

  return (
    <Dialog open title={isRole ? "Change role" : next === "suspended" ? "Suspend this account" : "Restore this account"} onClose={onClose} busy={mut.isPending} role="alertdialog">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="rounded-lg bg-bg-tint px-3 py-2 text-sm">
          <strong>{act.user.full_name}</strong>
          <span className="block break-all">{act.user.email}</span>
          Now: {ROLE_LABEL[act.user.role]}, {USER_STATUS_LABEL[act.user.status].toLowerCase()}
        </p>
        {isRole ? (
          <Field label="New role" required help={ROLE_HELP[role]}>
            {(p) => (
              <select {...p} value={role} onChange={(e) => setRoleValue(e.target.value as Role)} className={inputClass}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <p className="text-sm">{next === "suspended" ? "They are signed out and cannot sign in or refresh until you restore the account. Their data is kept." : "They can sign in again with their password."}</p>
        )}
        <Field label="Reason" required error={err} help="Kept in the action log.">{(p) => <input {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={inputClass} />}</Field>
        {mut.error ? <ErrorState compact error={mut.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant={isRole || next === "active" ? "primary" : "danger"} loading={mut.isPending}>
            {isRole ? "Change role" : next === "suspended" ? "Suspend" : "Restore"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { invite } = useUserMutations();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"content_editor" | "admin">("content_editor");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setEmail("");
    setName("");
    setRole("content_editor");
    setErrors({});
    invite.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) err.email = "Enter a valid email address.";
    if (!name.trim()) err.name = "Enter their name.";
    setErrors(err);
    if (Object.keys(err).length) return;
    try {
      await invite.mutateAsync({ email: email.trim(), full_name: name.trim(), role });
      toast.success("Staff account created. They get an email to set a password.");
      onClose();
    } catch {}
  }
  return (
    <Dialog open={open} title="Add staff" onClose={onClose} busy={invite.isPending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Full name" required error={errors.name}>{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputClass} />}</Field>
        <Field label="Email" required error={errors.email}>{(p) => <input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} className={inputClass} />}</Field>
        <Field label="Role" required help={ROLE_HELP[role]}>
          {(p) => (
            <select {...p} value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={inputClass}>
              <option value="content_editor">{ROLE_LABEL.content_editor}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>
          )}
        </Field>
        {invite.error ? <ErrorState compact error={invite.error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={invite.isPending}>
            Create account
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
