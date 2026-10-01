import { expect, test } from "@playwright/test";
import { collectErrors, registerViaApi, seriousViolations, signIn, uniqueEmail } from "./helpers";

/**
 * "/" (W9b): the truthful landing for visitors, with facts computed at request time (never at build) from the
 * catalog fixtures, and Go to Today for signed-in students.
 */

test("landing: live facts for visitors, computed from the catalog", async ({ page, request }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  // The first request may load the registration term; the facts show once it answers within the budget.
  await expect
    .poll(
      async () => {
        await page.goto("/");
        return page.getByTestId("landing-facts").count();
      },
      { timeout: 60_000 },
    )
    .toBe(1);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("in one place");
  const account = page.getByRole("navigation", { name: "Account" });
  await expect(account.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(account.getByRole("link", { name: "Create account" })).toBeVisible();

  // The number is the catalog's own count for the registration term, not a constant.
  const search = await request.get("/api/catalog/search?term=202602&pageSize=1");
  expect(search.status()).toBe(200);
  const { total } = (await search.json()) as { total: number };
  expect(total).toBeGreaterThan(0);
  const courses = page.locator("[data-fact=courses]");
  await expect(courses).toContainText(
    `${total.toLocaleString("en-US")}courses on the Spring 2027 schedule`,
  );
  await expect(courses.locator("[data-source=course-schedule]")).toHaveText(
    "Source: Course schedule",
  );
  await expect(page.locator("[data-fact=careers]")).toContainText(/^\d+career paths/);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
    expect(await seriousViolations(page), `axe ${colorScheme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("landing: signed-in students get Go to Today", async ({ page, request }) => {
  const email = uniqueEmail("e2e-landing");
  const password = "landing e2e password";
  await registerViaApi(request, { name: "Lan Ding", email, password });
  await signIn(page, email, password);
  await page.goto("/");
  const account = page.getByRole("navigation", { name: "Account" });
  await expect(account.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await account.getByRole("link", { name: "Go to Today" }).click();
  await expect(page).toHaveURL(/\/today$/);
});
