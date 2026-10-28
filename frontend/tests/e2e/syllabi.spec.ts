import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  aiStudent,
  horizontalOverflow,
  isMobile,
  newSignedInAccount,
  SAME_ORIGIN,
  seriousViolations,
  smallTapTargets,
} from "./helpers";

/**
 * /syllabi end to end, at 1440 and 390 (PLAN-UX §3, owner decision 2): connect a Moodle calendar (the fixture
 * feed, tests/fixtures/external/course-site) and see its due dates on Today marked Moodle, with Today's pointer to
 * /syllabi before; paste a syllabus, review what the mock AI found and save it once. With SYL_SHOTS_DIR set, each
 * state is also saved as a screenshot there.
 */

const MOODLE_URL =
  "https://moodle.davidson.edu/calendar/export_execute.php?userid=4242&authtoken=0123456789abcdef0123456789abcdef01234567&preset_what=all&preset_time=recentupcoming";

const SYLLABUS = [
  "CSC 221: Data Structures, Fall 2026",
  "Schedule",
  "Week 7: Midterm exam on October 15 in class.",
  "Week 15: Final paper due December 3 by 11:59 pm.",
].join("\n");

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SYL_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const width = page.viewportSize()?.width ?? 1440;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, `${name}-${width}.png`), fullPage: true });
}

async function checkPage(page: Page): Promise<void> {
  expect(await seriousViolations(page, "main")).toEqual([]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  if (isMobile(page)) expect(await smallTapTargets(page)).toEqual([]);
}

async function addClass(page: Page, courseCode: string): Promise<void> {
  const res = await page.request.post("/api/plan/items", {
    data: { termCode: "202601", courseCode, status: "registered" },
    headers: SAME_ORIGIN,
  });
  expect(res.status(), `add ${courseCode}`).toBe(201);
}

test("connects Moodle and sees its due dates on Today, marked Moodle", async ({
  page,
  request,
}) => {
  await newSignedInAccount(page, request, "moodle");
  await addClass(page, "CSC 221");

  // Classes this term, no syllabus, no Moodle: Today points to /syllabi.
  await page.goto("/today");
  const due = page.getByRole("region", { name: /^Due for you/ });
  await due.getByRole("link", { name: /Add your syllabi or connect Moodle/ }).click();
  await expect(page).toHaveURL(/\/syllabi$/);

  const panel = page.getByTestId("moodle-panel");
  await expect(page.getByRole("heading", { name: "Connect Moodle" })).toBeVisible();
  await expect(panel).toContainText("Get calendar URL");
  await checkPage(page);
  await shot(page, "syllabi-empty");

  // A link that is not Moodle's is refused in the page, before anything is sent.
  await panel.getByLabel("Moodle calendar URL").fill("https://example.com/calendar.ics");
  await panel.getByRole("button", { name: "Connect Moodle" }).click();
  await expect(panel).toContainText("not a Davidson Moodle calendar link");

  await panel.getByLabel("Moodle calendar URL").fill(MOODLE_URL);
  await panel.getByRole("button", { name: "Connect Moodle" }).click();
  await expect(page.getByTestId("moodle-status")).toHaveText(
    "Connected · last synced Sep 30, 12:00 PM",
  );
  const imported = page.getByTestId("moodle-imported");
  await expect(imported).toContainText("6 upcoming deadlines are in your plan");
  await expect(imported.getByTestId("moodle-deadline").first()).toContainText("Problem set 3");
  // The link is never shown back.
  expect(await page.content()).not.toContain("authtoken=");
  await checkPage(page);
  await shot(page, "syllabi-moodle-connected");

  await page.goto("/today");
  // The All view (the Classes view holds the same rows, hidden).
  const all = due.getByRole("tabpanel", { name: "All" });
  const row = all.getByTestId("due-soon-item").filter({ hasText: "Problem set 3" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("CSC 221");
  await expect(row.locator('[data-source="course-site"]')).toHaveText("Source: Moodle");
  await expect(all.getByTestId("due-soon-item").filter({ hasText: "Quiz 2 closes" })).toBeVisible();
  await expect(due.getByTestId("syllabi-pointer")).toHaveCount(0);
  await shot(page, "today-moodle");

  // Disconnect, removing what it imported.
  await page.goto("/syllabi");
  await panel.getByRole("button", { name: "Disconnect" }).click();
  await expect(panel.getByRole("checkbox", { name: /Also remove the 8 deadlines/ })).toBeChecked();
  await panel.getByRole("button", { name: "Yes, disconnect" }).click();
  await expect(panel.getByLabel("Moodle calendar URL")).toBeVisible();
  await page.goto("/today");
  await expect(due.getByTestId("due-soon-item").filter({ hasText: "Problem set 3" })).toHaveCount(
    0,
  );
});

test("pastes a syllabus, reviews the deadlines and saves them once", async ({ page }) => {
  await aiStudent(page, "syllabus", "Sasha Syllabus", { verified: true, consent: true });
  await page.goto("/syllabi");
  const form = page.getByRole("region", { name: "Paste a syllabus" });
  await expect(form.getByLabel("Term")).toHaveValue("202601");
  await expect(form.getByTestId("syllabus-disclosure")).toContainText("Anthropic");
  await form.getByLabel("Course").fill("CSC 221");
  await form.getByLabel("Syllabus text").fill(SYLLABUS);
  await expect(form).toContainText(`${SYLLABUS.length} of 20,000 characters`);
  await form.getByRole("button", { name: "Find deadlines" }).click();

  const review = page.getByRole("region", { name: "Review deadlines for CSC 221" });
  await expect(review.getByTestId("syllabus-deadline-row")).toHaveCount(2);
  await expect(review).toContainText("AI · check each date against your syllabus");
  await checkPage(page);
  await shot(page, "syllabi-review");

  await review.getByRole("button", { name: "Add 2 deadlines to plan" }).click();
  await expect(page.getByText("Added 2 deadlines to your plan.")).toBeVisible();
  const list = page.getByRole("list", { name: "Your syllabi" });
  await expect(list.getByTestId("syllabus-row")).toContainText(
    "2 deadlines found · 2 in your plan",
  );

  // Saving the same review again adds nothing twice.
  await list.getByRole("button", { name: /Review deadlines/ }).click();
  await page
    .getByRole("region", { name: "Review deadlines for CSC 221" })
    .getByRole("button", { name: "Add 2 deadlines to plan" })
    .click();
  await expect(page.getByText("Those deadlines are already in your plan.")).toBeVisible();
  await expect(list.getByTestId("syllabus-row")).toContainText("2 in your plan");

  // Pasting the same course and term again warns first.
  await form.getByLabel("Course").fill("CSC 221");
  await expect(form.getByTestId("syllabus-replace-warning")).toContainText(
    "removes the 2 deadlines it added to your plan",
  );
});
