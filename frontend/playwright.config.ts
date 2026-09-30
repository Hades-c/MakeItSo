import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build: `next build && next start -p 3210`, with an in-memory MongoDB
 * (started by tests/e2e/serve.mjs), the mock AI provider and EXTERNAL_MODE=fixtures (every outside service is
 * served from tests/fixtures/external). No real secrets, services or network are needed.
 *
 * Environment knobs:
 *   E2E_SKIP_BUILD=1          reuse an existing .next build (CI builds in an earlier step)
 *   E2E_MONGODB_URI=...       use this MongoDB instead of starting an in-memory one
 *   PW_CHROMIUM_EXECUTABLE=.. launch this Chromium instead of Playwright's bundled one (local machines)
 *   E2E_PORT=3210             serve on this port (give each parallel checkout its own)
 *   E2E_REUSE_SERVER=1        reuse a server already listening on E2E_PORT (off by default: another checkout's
 *                             server on the same port would silently be tested instead of this one)
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://localhost:${PORT}`;
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      // A phone: 390px wide, touch, mobile viewport handling and no hover (so hover-only UI shows up as broken).
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}node tests/e2e/serve.mjs`,
    url: `${baseURL}/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI && !!process.env.E2E_REUSE_SERVER,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    env: {
      E2E_PORT: String(PORT),
      NEXTAUTH_URL: baseURL,
      // `next start` runs with NODE_ENV=production, so the production checks apply: a 32+ character secret and
      // APP_ORIGIN (the Origin every POST/PUT/PATCH/DELETE must carry).
      NEXTAUTH_SECRET: "e2e-only-secret-not-for-production",
      APP_ORIGIN: baseURL,
      AI_PROVIDER: "mock",
      EXTERNAL_MODE: "fixtures",
      MAIL_PROVIDER: "console",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
