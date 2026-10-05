import { api } from "./client";
import type { components } from "./schema";

type S = components["schemas"];

export type Me = S["UserOut"];
/** The two staff roles the backend has. Everything else (student) is refused. */
export type StaffRole = "admin" | "content_editor";
export const isStaffRole = (role: string | null | undefined): role is StaffRole => role === "admin" || role === "content_editor";
export const roleLabel = (role: string) => (role === "admin" ? "Administrator" : role === "content_editor" ? "Content editor" : role);

// Staff accounts are created by an administrator (python -m app.cli create-admin); there is no public sign-up here.
export const authApi = {
  login: (email: string, password: string) => api.post<S["TokenOut"]>("/auth/login", { email, password }, { auth: "none" }),
  setPassword: (token: string, password: string) => api.post<S["TokenOut"]>("/auth/set-password", { token, password }, { auth: "none" }),
  forgotPassword: (email: string) => api.post<S["MessageOut"]>("/auth/forgot-password", { email }, { auth: "none" }),
  logout: (refreshToken: string | null) => api.post<void>("/auth/logout", refreshToken ? { refresh_token: refreshToken } : {}),
  me: () => api.get<Me>("/users/me"),
};
