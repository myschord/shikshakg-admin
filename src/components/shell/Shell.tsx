"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { roleLabel } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/AuthContext";
import { navFor, type NavGroup } from "@/lib/nav";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

/** Sidebar on desktop, a drawer on a tablet. Not designed for phones. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  useFocusTrap(drawer, open);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!user) return null;
  const groups = navFor(user.role);
  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-white lg:flex" aria-label="Main">
        <SidebarBody groups={groups} pathname={pathname} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div ref={drawer} role="dialog" aria-modal="true" aria-label="Menu" className="flex h-full w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="ml-auto mr-2 mt-2 flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-border-tint">
              <X className="h-5 w-5" aria-hidden />
            </button>
            <SidebarBody groups={groups} pathname={pathname} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 py-2 sm:px-6">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-border-tint lg:hidden">
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          {/* The audit-friendly "who am I" header: every action in the console is taken as this person. */}
          <div className="ml-auto flex items-center gap-3 text-right" aria-label="Signed in as">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.full_name}</p>
              <p className="truncate text-xs text-ink-muted">
                {user.email} · <span className="font-semibold text-primary-dark">{roleLabel(user.role)}</span>
              </p>
            </div>
            <button type="button" onClick={signOut} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:border-primary hover:text-primary">
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarBody({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  return (
    <>
      <div className="flex h-16 items-center gap-2 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
          <ShieldCheck className="h-4 w-4" aria-hidden />
        </span>
        <span className="font-extrabold">ShikshakG Admin</span>
      </div>
      <nav aria-label="Console" className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((i) => {
                const active = i.href === pathname || (i.href !== "/" && pathname.startsWith(`${i.href}/`) && !groups.some((gg) => gg.items.some((o) => o.href.length > i.href.length && (pathname === o.href || pathname.startsWith(`${o.href}/`)))));
                const Icon = i.icon;
                const base = "flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium";
                return (
                  <li key={i.href}>
                    {i.built ? (
                      <Link href={i.href} aria-current={active ? "page" : undefined} className={`${base} ${active ? "bg-primary text-white" : "text-ink hover:bg-border-tint"}`}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden /> {i.label}
                      </Link>
                    ) : (
                      <span aria-disabled="true" className={`${base} cursor-not-allowed text-ink-muted`}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden /> {i.label}
                        <span className="ml-auto rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold">Soon</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
