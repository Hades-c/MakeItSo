import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers";
import {
  expectAllTagged,
  horizontalOverflow,
  isMobile,
  newSignedInAccount,
  newVerifiedAccount,
  seriousViolations,
} from "../w9a/e2e";

/**
 * /careers and /careers/[slug] (W9a) against the production build in fixtures mode (server "now" 2026-09-30:
 * current Fall 2026, registration Spring 2027). Runs at desktop 1440 and phone 390 (playwright.config projects).
 */

const PLAN_UNAVAILABLE = "Adding courses to your plan isn’t available yet. Try again later.";

test("the careers index: 24 paths, URL filters, tagged counts, accessible", async ({
  page,
  request,
}) => {
  const errors = collectErrors(page);
  await newSignedInAccount(page, request, "e2e-careers");

  const response = await page.goto("/careers");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Careers" })).toBeVisible();
  const cards = page.getByRole("main").getByRole("article");
  await expect(cards).toHaveCount(24);

  // The registration-schedule counts stream in, each with its COURSE SCHEDULE tag.
  const se = page.getByRole("article", { name: "Software Engineering" });
  await expect(se.getByTestId("career-card-offered")).toContainText(
    /\d of 8 courses offered in Spring 2027/,
  );
  await expect(page.getByTestId("career-card-offered")).toHaveCount(24);
  expect(await expectAllTagged(page)).toBeGreaterThanOrEqual(24);
  await expect(se.getByTestId("career-card-pay")).toContainText(/\$[\d,]+ median pay \(May 2025\)/);

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);

  // Cluster filter: a link that keeps everything in the URL.
  await page
    .getByRole("navigation", { name: "Career clusters" })
    .getByRole("link", { name: /^Health/ })
    .click();
  await expect(page).toHaveURL(/\/careers\?cluster=health$/);
  await expect(page.getByTestId("careers-count")).toContainText(/Showing \d+ of 24 career paths/);
  const healthCount = await cards.count();
  expect(healthCount).toBeGreaterThan(0);
  expect(healthCount).toBeLessThan(24);

  // Search keeps the cluster; a query nobody matches shows the empty state.
  await page.getByLabel("Search careers").fill("underwater basket weaving");
  await page.getByRole("main").getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/cluster=health&q=underwater\+basket\+weaving/);
  await expect(page.getByRole("heading", { name: "No career paths match" })).toBeVisible();
  await page.getByRole("link", { name: "Show all careers" }).click();
  await expect(page).toHaveURL(/\/careers$/);
  await expect(cards).toHaveCount(24);

  // A card opens its career page.
  await page.getByRole("link", { name: "Data Science & Analytics", exact: true }).click();
  await expect(page).toHaveURL(/\/careers\/data-science$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data Science & Analytics");
  expect(errors).toEqual([]);
});

test("a career page: live availability per term, Add to plan, sourced sections", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await newSignedInAccount(page, request, "e2e-career");

  const response = await page.goto("/careers/software-engineering");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Software Engineering" })).toBeVisible();
  await expect(page).toHaveTitle(/Software Engineering/);

  // Every course with its live availability, tagged COURSE SCHEDULE.
  const courses = page.getByTestId("career-courses").locator(":scope > li");
  await expect(courses).toHaveCount(8);
  const csc221 = page.locator('[data-course="CSC 221"]');
  await expect(csc221.getByRole("radio", { name: "Fall 2026" })).toBeAttached();
  await expect(csc221.getByRole("radio", { name: "Spring 2027" })).toBeChecked();
  const fall2027 = csc221.getByRole("radio", { name: "Fall 2027" });
  await expect(fall2027).toHaveAccessibleDescription(/Not yet published|Usually offered in Fall/);

  // Pay with its source, departments into the catalog, official programs, Handshake by its base URL.
  await expect(page.getByTestId("career-pay")).toContainText("May 2025");
  await expect(
    page.getByRole("link", { name: /Source: BLS Occupational Outlook Handbook/ }),
  ).toHaveAttribute("href", /^https:\/\/www\.bls\.gov\/ooh\//);
  await expect(page.getByRole("link", { name: /CSC Computer Science/ })).toHaveAttribute(
    "href",
    "/courses?dept=CSC",
  );
  await expect(
    page.getByRole("link", { name: "Major in Computer Science (B.S. Degree)" }),
  ).toHaveAttribute(
    "href",
    /^https:\/\/catalog\.davidson\.edu\/preview_program\.php\?catoid=28&poid=\d+$/,
  );
  await expect(page.getByRole("link", { name: "Open Handshake" })).toHaveAttribute(
    "href",
    "https://davidson.joinhandshake.com/",
  );
  await expect(page.getByTestId("handshake-query")).toHaveText("software engineer");
  expect(await expectAllTagged(page)).toBeGreaterThan(8);

  // An unverified account sees why there are no alumni, not the alumni.
  await expect(page.getByTestId("alumni-gate")).toContainText("Verify your Davidson email");
  await expect(page.locator("[data-alumnus]")).toHaveCount(0);
  // Nothing AI on this branch.
  await expect(page.getByText(/AI · verify with your advisor/)).toHaveCount(0);

  expect(await horizontalOverflow(page), "scrolls sideways").toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);

  // Add to plan: the plan service lands separately, so either it is added or the page says it is not available
  // yet; it never pretends.
  const add = csc221.getByRole("button", { name: "Add to Spring 2027" });
  if (isMobile(page)) await add.tap();
  else await add.click();
  await expect(
    csc221
      .getByRole("button", { name: "In your plan for Spring 2027" })
      .or(csc221.getByText(PLAN_UNAVAILABLE)),
  ).toBeVisible();

  // Choosing another term clears the message and moves the button.
  if (isMobile(page)) await csc221.getByText("Fall 2027").tap();
  else await csc221.getByText("Fall 2027").click();
  await expect(fall2027).toBeChecked();
  await expect(csc221.getByRole("button", { name: "Add to Fall 2027" })).toBeVisible();
  // The plan route is missing or not implemented on this branch: its 404/501 is the only allowed console error.
  expect(errors.filter((e) => !/status of (404|501)/.test(e))).toEqual([]);
});

test("a verified account sees the verified alumni on a career page", async ({ page, request }) => {
  test.setTimeout(60_000);
  await newVerifiedAccount(page, request, "e2e-career-alumni");
  await page.goto("/careers/data-science");
  const section = page.getByRole("region", { name: /Alumni on this path/ });
  await expect(section.getByTestId("alumni-provenance")).toContainText(
    /Compiled from public sources · checked .+ · Request removal\/correction/,
  );
  await expect(section.locator("[data-alumnus]").first()).toBeVisible();
  await expect(section.getByRole("link", { name: "All alumni" })).toHaveAttribute(
    "href",
    "/alumni?career=data-science",
  );
  await expect(section.getByRole("link", { name: /LinkedIn/ }).first()).toHaveAttribute(
    "href",
    /^https:\/\/www\.linkedin\.com\/in\/[^/]+\/$/,
  );
  expect(await seriousViolations(page)).toEqual([]);
});

test("an unknown career answers 404 inside the shell", async ({ page, request }) => {
  await newSignedInAccount(page, request, "e2e-career-404");
  const response = await page.goto("/careers/astronaut");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "We couldn't find that page" }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Page not found/);
});

test("old career links still reach the careers pages", async ({ page, request }) => {
  await newSignedInAccount(page, request, "e2e-career-redirect");
  await page.goto("/career");
  await expect(page).toHaveURL(/\/careers$/);
  await page.goto("/career/software-engineering");
  await expect(page).toHaveURL(/\/careers\/software-engineering$/);
});
