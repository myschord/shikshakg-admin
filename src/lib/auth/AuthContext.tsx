"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, isStaffRole, type Me, type StaffRole } from "@/lib/api/auth";
import { setUnauthorizedHandler } from "@/lib/api/client";
import { cacheUser, clearTokens, getAccessToken, getCachedUser, getRefreshToken, setTokens } from "@/lib/api/tokens";

/** True while an explicit sign-out is in progress, so the login page does not remember the page you left. */
export const signOutState = { active: false };

export class NotStaffError extends Error {
  constructor() {
    super("This console is for ShikshakG staff. Students sign in on the main website.");
    this.name = "NotStaffError";
  }
}

type Ctx = {
  /** The signed-in staff member. The role always comes from the server, never from the browser. */
  user: (Me & { role: StaffRole }) | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<Ctx["user"]>(null);
  const [loading, setLoading] = useState(true);

  const end = useCallback(() => {
    clearTokens();
    setUser(null);
    qc.clear();
  }, [qc]);

  // On every load, ask the server who this is. The cached copy is only used to avoid a flash.
  useEffect(() => {
    let alive = true;
    setUnauthorizedHandler(() => {
      setUser(null);
      qc.clear();
    });
    (async () => {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      const cached = getCachedUser<Me>();
      if (cached && isStaffRole(cached.role)) setUser(cached as Ctx["user"]);
      try {
        const me = await authApi.me();
        if (!alive) return;
        if (isStaffRole(me.role)) {
          cacheUser(me);
          setUser(me as Ctx["user"]);
        } else {
          end(); // a student's token never opens the console
        }
      } catch {
        if (alive && !getAccessToken()) setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      setUnauthorizedHandler(null);
    };
  }, [qc, end]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      // Check the role before keeping anything: a student who finds this page gets no session here.
      if (!isStaffRole(res.user.role)) {
        try {
          await authApi.logout(res.refresh_token);
        } catch {}
        clearTokens();
        throw new NotStaffError();
      }
      signOutState.active = false;
      setTokens(res);
      cacheUser(res.user);
      setUser(res.user as Ctx["user"]);
    },
    []
  );

  const logout = useCallback(async () => {
    signOutState.active = true;
    const refresh = getRefreshToken();
    try {
      await authApi.logout(refresh);
    } catch {}
    end();
  }, [end]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
