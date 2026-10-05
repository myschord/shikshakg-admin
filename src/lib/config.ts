// Build-time config. NEXT_PUBLIC_* values are baked into the static export.
export const config = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8020").replace(/\/+$/, ""),
  appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
} as const;

export const API_PREFIX = "/api/v1";
