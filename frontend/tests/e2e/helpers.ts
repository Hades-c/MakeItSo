import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** The app origin (playwright.config.ts serves on E2E_PORT). */
export const E2E_ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3210}`;

/**
 * Headers for direct API calls from tests: state-changing routes require the app's Origin (CSRF protection,
 * server/http/origin.ts), which browsers add by themselves but Playwright's request context does not.
 */
export const SAME_ORIGIN = { origin: E2E_ORIGIN } as const;

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@davidson.edu`;
}

/** The form's error message (Next.js also renders an empty role="alert" route announcer). */
export function formError(page: Page) {
  return page.getByRole("alert").filter({ hasText: /\S/ });
}

export async function registerViaApi(
  request: APIRequestContext,
  { name, email, password }: { name: string; email: string; password: string },
) {
  const res = await request.post("/api/auth/register", {
    data: { name, email, password },
    headers: SAME_ORIGIN,
  });
  expect(res.status()).toBe(201);
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
}

/** Collects console errors and uncaught page errors for the page's lifetime. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}
