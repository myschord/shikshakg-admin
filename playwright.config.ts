import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests run against the production build served with the headers Cloudflare will send, and the real
 * local backend on port 8020 (its CORS_ORIGINS must include http://localhost:3100).
 * Start the backend (`docker compose up` in shikshag_backend), then: `npm run build && npm run e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // A slow or busy machine should not fail a test that is only waiting for a click to become possible.
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", actionTimeout: 30_000 },
  webServer: { command: "node scripts/serve-out.mjs", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 30_000 },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
