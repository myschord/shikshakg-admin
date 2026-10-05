// Token storage. Both tokens rotate on every refresh, so they are always written together.
const ACCESS = "sga_token";
const REFRESH = "sga_refresh_token";
const USER = "sga_user";

const hasWindow = () => typeof window !== "undefined";

function read(key: string): string | null {
  if (!hasWindow()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked (private mode): the session lasts until the tab closes
  }
}

export const getAccessToken = () => read(ACCESS);
export const getRefreshToken = () => read(REFRESH);

export function setTokens(tokens: { access_token: string; refresh_token?: string | null }) {
  write(ACCESS, tokens.access_token);
  if (tokens.refresh_token) write(REFRESH, tokens.refresh_token);
}

export function clearTokens() {
  if (!hasWindow()) return;
  try {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    localStorage.removeItem(USER);
  } catch {
    // ignore
  }
}

export const getCachedUser = <T,>(): T | null => {
  const raw = read(USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};
export const cacheUser = (user: unknown) => write(USER, JSON.stringify(user));
