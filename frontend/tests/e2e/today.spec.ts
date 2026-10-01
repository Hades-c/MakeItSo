import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { collectErrors, registerViaApi, SAME_ORIGIN, signIn, uniqueEmail } from "./helpers";
import {
  expectAllTagged,
  horizontalOverflow,
  isMobile,
  seriousViolations,
  smallTapTargets,
} from "../w9a/e2e";

/**
 * /today (W7) against the production build in fixtures mode: server "now" is Wed 2026-09-30 12:00 ET (current
 * Fall 2026, registration Spring 2027, WebTree opens Oct 12). A first-year with three Fall 2026 sections (CSC 221 A
 * MWF 10:30, ECO 232 A MWF 11:30, ENV 237 A MW 14:30) and one deadline sees the deterministic day summary, the
 * timeline with the now-line, the five-day strip, Due soon, degree progress, the Plan Spring 2027 call to action,
 * this week on campus, opportunities and quick links, every aggregated item tagged with its source. Runs at
 * desktop 1440 and phone 390, light and dark, with axe.
 */

const PASSWORD = "today e2e password 42";
const EVENT_SOURCES = ["wildcatsync", "hurt-hub", "library", "events-digest"];

function strip(page: Page) {
  return page.getByRole("navigation", { name: "This school week" });
}

async function newStudent(page: Page, request: APIRequestContext, prefix: string) {
  const email = uniqueEmail(prefix);
  await registerViaApi(request, { name: "Taylor Today", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
  return page.request;
}

/** The mockup student: onboarded class of 2030 with three Fall 2026 sections and a problem set due tomorrow. */
async function seedMockupStudent(api: APIRequestContext) {
  const profile = await api.patch("/api/profile", {
    data: { graduationYear: 2030, firstTerm: "202601", onboarded: true },
    headers: SAME_ORIGIN,
  });
  expect(profile.status()).toBe(200);
  for (const [courseCode, crn] of [
    ["CSC 221", "10144"],
    ["ECO 232", "10181"],
    ["ENV 237", "10230"],
  ]) {
    const res = await api.post("/api/plan/items", {
      data: { termCode: "202601", courseCode, crn, status: "in-progress" },
      headers: SAME_ORIGIN,
    });
    expect(res.status()).toBe(201);
  }
  const planned = await api.post("/api/plan/items", {
    data: { termCode: "202602", courseCode: "HIS 357" },
    headers: SAME_ORIGIN,
  });
  expect(planned.status()).toBe(201);
  const deadline = await api.post("/api/plan/deadlines", {
    data: { title: "Problem set", courseCode: "CSC 221", dueAt: "2026-10-01T23:59:00-04:00" },
    headers: SAME_ORIGIN,
  });
  expect(deadline.status()).toBe(201);
}

/** Wait until a read's background sync has stored every events feed of the fixtures. */
async function feedsStored(api: APIRequestContext) {
  await expect
    .poll(
      async () => {
        const res = await api.get("/api/events");
        const body = (await res.json()) as { sources: { id: string; lastSync: string | null }[] };
        return body.sources.filter((s) => EVENT_SOURCES.includes(s.id) && s.lastSync).length;
      },
      { timeout: 30_000 },
    )
    .toBe(EVENT_SOURCES.length);
}

test("today: the day summary, timeline, strip and panels for a student with sections", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const api = await newStudent(page, request, "e2e-today");
  await seedMockupStudent(api);
  await feedsStored(api);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const response = await page.goto("/today");
    expect(response?.status()).toBe(200);

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(
      "You're in ECO 232 until 12:20 PM, then one more class, and Problem set (CSC 221) is due tomorrow at 11:59 PM.",
    );
    const main = page.getByRole("main");
    await expect(main.getByText("Wednesday, September 30", { exact: true })).toBeVisible();
    await expect(page.getByTestId("day-counts")).toContainText("3 classes today");

    // The strip: Monday to Friday, today shown.
    const week = strip(page);
    await expect(week.getByRole("link")).toHaveCount(5);
    await expect(week.locator('a[aria-current="page"]')).toHaveAttribute("href", "/today");

    // The timeline: three classes, the now-line at noon, a free gap.
    const timeline = page.getByTestId("day-timeline");
    await expect(timeline.locator('[data-kind="class"]:visible')).toHaveCount(3);
    await expect(timeline.getByTestId("now-pill")).toHaveText("12:00p");
    await expect(timeline.locator('[data-kind="free"]').first()).toBeVisible();
    await expect(main.getByText(/^Fri 10:30 AM$/)).toBeVisible();

    // The call to action and the panels.
    await expect(page.getByRole("link", { name: "Plan Spring 2027" })).toHaveAttribute(
      "href",
      "/plan?tab=next",
    );
    await expect(page.getByTestId("webtree-window")).toContainText(
      "WebTree opens Mon, Oct 12 at 7:00 AM",
    );
    const due = page.getByTestId("due-soon-item");
    expect(await due.count()).toBeGreaterThan(2);
    await expect(due.filter({ hasText: "Problem set" })).toContainText("Tomorrow 11:59p");
    await expect(due.filter({ hasText: "WebTree Open" })).toContainText("Oct 12 – Nov 3");
    await expect(page.getByTestId("degree-progress")).toContainText("of 32 credits done");
    expect(await page.getByTestId("campus-item").count()).toBeGreaterThan(0);
    expect(await page.getByTestId("opportunity-item").count()).toBeGreaterThan(1);
    await expect(page.getByTestId("panel-error")).toHaveCount(0);
    await expect(page.getByTestId("onboarding-nudge")).toHaveCount(0);

    expect(await expectAllTagged(page)).toBeGreaterThan(8);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await seriousViolations(page)).toEqual([]);
    if (isMobile(page)) expect(await smallTapTargets(page), "tap targets under 44px").toEqual([]);
  }

  // Another day of the strip: Thursday has no class, only the problem set (and campus events).
  await strip(page)
    .getByRole("link", { name: /Thursday, October 1/ })
    .click();
  await expect(page).toHaveURL(/\/today\?day=2026-10-01$/);
  const thursday = page.getByRole("region", { name: /^Thursday, October 1/ });
  await expect(thursday).toBeVisible();
  await expect(thursday.getByTestId("now-pill")).toHaveCount(0);
  await expect(thursday.getByText("Problem set").first()).toBeVisible();
  // The headline still sums up today.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("You're in ECO 232");
  await thursday.getByRole("link", { name: "Back to today" }).click();
  await expect(page).toHaveURL(/\/today$/);

  expect(errors).toEqual([]);
});

test("today: a new student is asked to finish setting up", async ({ page, request }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await newStudent(page, request, "e2e-today-new");

  const response = await page.goto("/today");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Finish setting up MakeItSo to see your classes, deadlines and campus events here.",
  );
  const nudge = page.getByTestId("onboarding-nudge");
  await expect(nudge.getByRole("link", { name: "Set up my plan" })).toHaveAttribute(
    "href",
    "/onboarding",
  );
  await expect(page.getByTestId("timeline-empty")).toContainText(
    "No Fall 2026 class sections in your plan yet.",
  );
  await expect(page.getByTestId("degree-progress")).toContainText("0");
  expect(await expectAllTagged(page)).toBeGreaterThan(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
  if (isMobile(page)) expect(await smallTapTargets(page), "tap targets under 44px").toEqual([]);
  expect(errors).toEqual([]);
});

test("today: signed out goes to sign in and back", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Ftoday$/);
});
