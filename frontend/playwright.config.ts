import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build: `next build && next start -p 3210`, with an in-memory MongoDB
 * (started by tests/e2e/serve.mjs), the mock AI provider and EXTERNAL_MODE=fixtures (every outside service is
 * served from tests/fixtures/external; serve.mjs also makes any other outbound fetch from the server fail). No
 * real secrets, services or network are needed. Server "now" is pinned to the fixtures' day (FIXTURES_NOW) and
 * rate limits are off (RATE_LIMITS=off): off Vercel every request shares one client-IP bucket, and the suite
 * registers and signs in far more often than the real limits allow. Rate limits are unit-tested instead.
 *
 * One database for the server AND the test workers: unless E2E_MONGODB_URI is given, this file sets it to an
 * in-memory MongoDB on 127.0.0.1:E2E_MONGO_PORT, which tests/e2e/serve.mjs starts before `next start`. Specs that
 * seed the database directly (the hackathon-era legacy accounts and plans in onboarding, alumni and plan specs)
 * read the same E2E_MONGODB_URI, so they run in CI instead of skipping. (Not a globalSetup: Playwright starts the
 * webServer before globalSetup runs, so a globalSetup could not hand the URI to the server. The URI is fixed here
 * instead, and the runner passes process.env on to both the webServer and the workers.)
 *
 * Environment knobs:
 *   E2E_SKIP_BUILD=1          reuse an existing .next build (CI builds in an earlier step)
 *   E2E_MONGODB_URI=...       use this MongoDB instead of starting an in-memory one
 *   E2E_MONGO_PORT=3211       port of the in-memory MongoDB (default E2E_PORT + 1)
 *   PW_CHROMIUM_EXECUTABLE=.. launch this Chromium instead of Playwright's bundled one (local machines)
 *   E2E_PORT=3210             serve on this port (give each parallel checkout its own)
 *   E2E_REUSE_SERVER=1        reuse a server already listening on E2E_PORT (off by default: another checkout's
 *                             server on the same port would silently be tested instead of this one); pass that
 *                             server's E2E_MONGODB_URI too, or the DB-seeding specs write to the wrong database
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
const MONGO_PORT = Number(process.env.E2E_MONGO_PORT ?? PORT + 1);
// The runner evaluates this file first, and the workers it forks inherit its environment (they evaluate it again,
// and then see the value already set), so everyone uses the database serve.mjs starts.
const START_MONGO = !process.env.E2E_MONGODB_URI;
if (START_MONGO) process.env.E2E_MONGODB_URI = `mongodb://127.0.0.1:${MONGO_PORT}/makeitso-e2e`;
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
      // serve.mjs starts the in-memory MongoDB at E2E_MONGODB_URI (only when this config chose that URI).
      E2E_START_MONGO: START_MONGO ? String(MONGO_PORT) : "",
      NEXTAUTH_URL: baseURL,
      // `next start` runs with NODE_ENV=production, so the production checks apply: a 32+ character secret and
      // APP_ORIGIN (the Origin every POST/PUT/PATCH/DELETE must carry).
      NEXTAUTH_SECRET: "e2e-only-secret-not-for-production",
      APP_ORIGIN: baseURL,
      AI_PROVIDER: "mock",
      EXTERNAL_MODE: "fixtures",
      FIXTURES_NOW: "2026-09-30T12:00:00-04:00",
      RATE_LIMITS: "off",
      MAIL_PROVIDER: "console",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
