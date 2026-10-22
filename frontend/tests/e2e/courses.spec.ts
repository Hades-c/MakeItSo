import { expect, test, type Page } from "@playwright/test";
import {
  collectErrors,
  expectAllTagged,
  horizontalOverflow,
  isMobile,
  newSignedInAccount,
  newVerifiedAccount,
  SAME_ORIGIN,
  seriousViolations,
  smallTapTargets,
} from "./helpers";

/**
 * /courses and /courses/[term]/[code] (W8) against the production build in fixtures mode (server "now"
 * 2026-09-30: current Fall 2026, registration Spring 2027; the fixture catalog). Desktop 1440 and phone 390.
 */

/** Class of 2028 who started in Fall 2024: a junior in Spring 2027, so Fall 2025 is inside the plan. */
async function setProfile(page: Page) {
  const res = await page.request.patch("/api/profile", {
    data: { graduationYear: 2028, firstTerm: "202401" },
    headers: SAME_ORIGIN,
  });
  expect(res.status()).toBe(200);
}

async function addViaApi(page: Page, body: Record<string, unknown>) {
  const res = await page.request.post("/api/plan/items", { data: body, headers: SAME_ORIGIN });
  expect(res.status(), await res.text()).toBe(201);
}

async function checkPage(page: Page) {
  expect(await horizontalOverflow(page), "scrolls sideways").toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
  if (isMobile(page)) expect(await smallTapTargets(page), "tap targets under 44px").toEqual([]);
  expect(await expectAllTagged(page)).toBeGreaterThan(0);
}

test("search: the registration term by default, filters in the URL, back and reload", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await newSignedInAccount(page, request, "e2e-courses-search");

  const response = await page.goto("/courses");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  await expect(page.getByLabel("Term")).toHaveValue("202602");
  await expect(page.getByTestId("results-count")).toContainText(/of \d+ courses in Spring 2027/);
  await expect(page.getByTestId("course-results").getByRole("article")).toHaveCount(20);
  await checkPage(page);

  // Text search through the form: the URL carries it.
  await page.getByLabel("Search the schedule").fill("data structures");
  await page
    .getByRole("form", { name: "Course search" })
    .getByRole("button", { name: "Search" })
    .click();
  await expect(page).toHaveURL(/\/courses\?q=data\+structures&term=202602$/);
  // Focus lands on the new results (a polite live region announces the count).
  await expect(page.getByTestId("results-count")).toBeFocused();
  await expect(
    page.getByRole("status").filter({ has: page.getByTestId("results-count") }),
  ).toHaveAttribute("aria-live", "polite");
  const csc = page.getByRole("article", { name: /Data Structures/ });
  await expect(csc).toBeVisible();
  await expect(csc.getByText("Mathematical and Quantitative Thought")).toBeVisible();
  await expect(csc.getByTestId("row-sections")).toContainText("MWF 10:30a–11:20a");
  await expect(csc.getByRole("button", { name: "Add to Spring 2027" })).toBeVisible();

  // Filters: department, days free, open seats.
  await page.getByText("Filters", { exact: true }).click();
  await page.getByLabel("Department").selectOption("CSC");
  await page.getByRole("checkbox", { name: "Tuesday" }).check();
  await page.getByRole("checkbox", { name: "Thursday" }).check();
  await page.getByRole("checkbox", { name: "Open seats only" }).check();
  await page.getByLabel("Search the schedule").fill("");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/dept=CSC/);
  await expect(page).toHaveURL(/days=T&days=R/);
  await expect(page).toHaveURL(/openOnly=true/);
  const filtered = page.url();
  const active = page.getByTestId("active-filters");
  await expect(active.getByRole("link", { name: /Only Tue, Thu/ })).toBeVisible();
  await expect(page.getByLabel("Department")).toHaveValue("CSC");

  // Reload and back keep the state.
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Tuesday" })).toBeChecked();
  await page.goBack();
  await expect(page).toHaveURL(/q=data\+structures/);
  await expect(page.getByLabel("Search the schedule")).toHaveValue("data structures");
  await page.goForward();
  await expect(page).toHaveURL(filtered);

  // Removing one filter keeps the others; another term from the selector.
  await active.getByRole("link", { name: /Open seats/ }).click();
  await expect(page).not.toHaveURL(/openOnly/);
  await expect(page).toHaveURL(/dept=CSC/);
  await page.getByLabel("Term").selectOption("202601");
  await page
    .getByRole("form", { name: "Course search" })
    .getByRole("button", { name: "Search" })
    .click();
  await expect(page.getByTestId("results-count")).toContainText("in Fall 2026");

  // Nothing matches: an empty state that names the search.
  await page.goto("/courses?q=underwater+basket+weaving");
  await expect(
    page.getByRole("heading", { name: "No Spring 2027 courses match “underwater basket weaving”" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a course page: sections, requirements, other terms, conflicts and Add to plan", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await newSignedInAccount(page, request, "e2e-course-page");
  await setProfile(page);
  // BIO 201 A meets MWF 10:30, like CSC 221 A; CSC 221 was completed in Fall 2025 (a retake).
  await addViaApi(page, { termCode: "202602", courseCode: "BIO 201", crn: "20060" });
  await addViaApi(page, { termCode: "202501", courseCode: "CSC 221", status: "completed" });

  const response = await page.goto("/courses/202602/CSC-221");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Data Structures" })).toBeVisible();
  const header = page.getByTestId("course-header");
  await expect(header).toContainText("CRN 20135");
  await expect(header.getByText(/of 24 seats open/)).toBeVisible();
  await expect(page.getByTestId("course-prerequisites")).toContainText(
    "CSC/DIG 120, CSC 121, BIO/CSC 209, PHY 240, or permission of instructor.",
  );
  await expect(page.getByTestId("course-requirements")).toContainText(
    "Mathematical and Quantitative Thought",
  );
  const terms = page.getByTestId("other-terms");
  await expect(terms.locator('[data-term="202701"]')).toContainText("Not yet published");
  await expect(terms.locator('[data-term="202601"]')).toContainText("Offered · 2 sections");

  // The week grid against the plan: CSC 221 A overlaps BIO 201 A.
  const week = page.getByTestId("course-week");
  await expect(week.getByText("1 conflict")).toBeVisible();
  const add = page.getByRole("region", { name: "Add to plan" });
  const warnings = add.getByTestId("add-warnings");
  await expect(warnings).toContainText("Already completed in Fall 2025 — plan a retake?");
  await expect(warnings).toContainText(/CSC 221 A overlaps BIO 201 A in your Spring 2027 plan/);
  await checkPage(page);

  // Section B fits: the URL picks it, the grid and the warnings follow.
  await page
    .getByRole("article", { name: /Section B/ })
    .getByRole("link", { name: /Show in my week/ })
    .click();
  await expect(page).toHaveURL(/\/courses\/202602\/CSC-221\?crn=20136#week$/);
  await expect(week.getByText("No conflicts")).toBeVisible();
  // The week card comes into view and its heading takes focus (the link was replaced).
  await expect(page.locator("#week-title")).toBeFocused();
  await expect(page.locator("#week-title")).toBeInViewport();
  await expect(warnings).not.toContainText("overlaps");
  await expect(add.getByTestId("add-section")).toContainText("CSC 221 B");

  // Add it: the plan service answers with its own warnings, and the page refreshes.
  await add.getByRole("button", { name: "Add to Spring 2027" }).click();
  const notice = add.getByTestId("add-to-plan-notice");
  await expect(notice).toContainText("Added CSC 221 B to Spring 2027.");
  await expect(notice.getByTestId("added-warnings")).toContainText("plan a retake?");
  await expect(add.getByRole("button", { name: "In your plan for Spring 2027" })).toBeVisible();
  await page.reload();
  await expect(add.getByRole("button", { name: "In your plan for Spring 2027" })).toBeVisible();
  await expect(week).toContainText("including CSC 221 B");

  const plan = (await (await page.request.get("/api/plan")).json()) as {
    plan: { items: { courseCode: string; termCode: string; crn?: string }[] };
  };
  expect(plan.plan.items).toContainEqual(
    expect.objectContaining({ courseCode: "CSC 221", termCode: "202602", crn: "20136" }),
  );
  expect(errors).toEqual([]);
});

test("Add to <term> from a search row; reload shows it in the plan", async ({ page, request }) => {
  test.setTimeout(60_000);
  await newSignedInAccount(page, request, "e2e-courses-row");
  await page.goto("/courses?q=CSC+121");
  const row = page.getByRole("article", { name: /Programming & Problem Solving/ });
  await row.getByRole("button", { name: "Add to Spring 2027" }).click();
  await expect(row.getByTestId("add-to-plan-notice")).toContainText(
    "Added CSC 121 to Spring 2027.",
  );
  await page.reload();
  await expect(
    page
      .getByRole("article", { name: /Programming & Problem Solving/ })
      .getByRole("button", { name: "In your plan for Spring 2027" }),
  ).toBeVisible();
});

test("a course not on this term's schedule, and real 404s", async ({ page, request }) => {
  await newSignedInAccount(page, request, "e2e-course-404");
  const notOffered = await page.goto("/courses/202602/HIS-357");
  expect(notOffered?.status()).toBe(200);
  await expect(page.getByTestId("not-offered-here")).toContainText(
    "Not on the Spring 2027 schedule. Shown from Fall 2026.",
  );
  await expect(page.getByRole("radio", { name: "Spring 2027" })).toBeDisabled();
  await checkPage(page);

  // Other spellings of a code redirect to the one canonical URL.
  const variant = await page.goto("/courses/202602/csc221");
  expect(variant?.status()).toBe(200);
  await expect(page).toHaveURL(/\/courses\/202602\/CSC-221$/);

  for (const path of [
    "/courses/202602/XYZ-999",
    "/courses/000001/CSC-221",
    "/courses/2026/CSC-221",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
});

test("the AI panel asks a verified student to turn AI on first", async ({ page, request }) => {
  test.setTimeout(60_000);
  await newVerifiedAccount(page, request, "e2e-course-ai");
  await page.goto("/courses/202602/CSC-221");
  const panel = page.getByTestId("course-about-ai");
  await expect(panel).toContainText("Turn on AI features in your profile to use this.");
  await expect(
    panel.getByRole("link", { name: "Turn on AI features in your profile" }),
  ).toHaveAttribute("href", "/profile");
  expect(await expectAllTagged(page)).toBeGreaterThan(0);
});

test("no sideways scroll at 360px on the pages with the longest upstream text", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await newSignedInAccount(page, request, "e2e-courses-360");
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of [
    "/courses",
    "/courses?q=topics",
    "/courses/202602/SPA-377",
    "/courses/202602/ECO-204",
    "/courses/202602/HIS-184",
    "/courses/202602/WRI-101",
    "/courses/202602/AFR-308",
    "/courses/202602/AFR-270",
    "/courses/202602/BIO-201",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    expect(await horizontalOverflow(page), `${path} scrolls sideways`).toBeLessThanOrEqual(0);
  }
});

test("a past term MakeItSo keeps no schedule for says so", async ({ page, request }) => {
  await newSignedInAccount(page, request, "e2e-courses-past");
  await page.goto("/courses?term=202102");
  await expect(
    page.getByRole("heading", { name: "No Spring 2022 schedule in MakeItSo" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Search the latest schedule" })).toHaveAttribute(
    "href",
    "/courses",
  );
});
