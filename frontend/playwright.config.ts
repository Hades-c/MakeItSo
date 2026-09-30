import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build: `next build && next start -p 3210`, with an in-memory MongoDB
 * (started by tests/e2e/serve.mjs) and the mock AI provider. No real secrets or services are needed.
 *
 * Environment knobs:
 *   E2E_SKIP_BUILD=1          reuse an existing .next build (CI builds in an earlier step)
 *   E2E_MONGODB_URI=...       use this MongoDB instead of starting an in-memory one
 *   PW_CHROMIUM_EXECUTABLE=.. launch this Chromium instead of Playwright's bundled one (local machines)
 */
const PORT = 3210;
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
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
  webServer: {
    command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}node tests/e2e/serve.mjs`,
    url: `${baseURL}/login`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    env: {
      E2E_PORT: String(PORT),
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: "e2e-only-secret-not-for-production",
      AI_PROVIDER: "mock",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
