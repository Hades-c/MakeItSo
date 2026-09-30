import { expect, test } from "@playwright/test";
import { formError, uniqueEmail } from "./helpers";

test("landing page renders with security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("in one place");
  // Truthful copy only: no invented statistics or model claims.
  await expect(page.locator("body")).not.toContainText(/Gemini|Powered by/i);
});

test("signed-out visitors are sent to /login, and old routes redirect", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("register, sign out, and sign back in", async ({ page }) => {
  const email = uniqueEmail("e2e-auth");
  const password = "e2e password 123";

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Casey Wildcat");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await expect(page.getByLabel("Class year")).toHaveText("First-year");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect(page.getByText("Welcome, Casey.")).toBeVisible();

  await page.getByRole("button", { name: /Account menu/ }).click();
  await expect(page.getByTestId("hub-user-email")).toHaveText(email);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(formError(page)).toHaveText("Invalid email or password");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText("Welcome, Casey.")).toBeVisible();
});

test("registering an existing email shows an error", async ({ page, request }) => {
  const email = uniqueEmail("e2e-dup");
  const created = await request.post("/api/auth/register", {
    data: { name: "First Person", email, password: "password 12345" },
  });
  expect(created.status()).toBe(201);

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Second Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password 12345");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(formError(page)).toHaveText("An account with that email already exists");
});
