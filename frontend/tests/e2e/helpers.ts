import { expect, type APIRequestContext, type Page } from "@playwright/test";

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
  const res = await request.post("/api/auth/register", { data: { name, email, password } });
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
