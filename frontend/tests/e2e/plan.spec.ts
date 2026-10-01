import { expect, test, type Page } from "@playwright/test";
import { collectErrors, SAME_ORIGIN } from "./helpers";
import {
  addItem,
  horizontalOverflow,
  isMobile,
  newPlanner,
  seriousViolations,
  smallTapTargets,
  untaggedRows,
  verifyAndConsent,
} from "../w5u/e2e";

/**
 * /plan (W5u) against the production build in fixtures mode (server "now" 2026-09-30 12:00 ET: current Fall
 * 2026, registration Spring 2027, fixture catalog). Desktop 1440 and phone 390 (playwright.config projects).
 * The WebTree flow runs end to end: search the catalog, pick sections, alternates, the conflict check,
 * keyboard reordering, Copy for WebTree (clipboard and the selectable-text fallback) and the print view.
 */

async function checkPage(page: Page, what: string) {
  // A refresh after a save may still be streaming: let it settle (the title is part of its metadata).
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveTitle(/My plan/);
  expect(await horizontalOverflow(page), `${what}: horizontal overflow`).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page), `${what}: axe`).toEqual([]);
  if (isMobile(page)) expect(await smallTapTargets(page), `${what}: tap targets`).toEqual([]);
}

/** Search the registration schedule, pick the section with `crn`, add it where the "Add as" select says. */
async function addSection(page: Page, query: string, course: string, crn: string) {
  const panel = page.getByTestId("webtree-add");
  await panel.getByLabel("Search the Spring 2027 schedule").fill(query);
  await panel.getByRole("button", { name: "Search", exact: true }).click();
  await panel
    .getByRole("list", { name: "Search results" })
    .getByRole("button", { name: `Choose a section of ${course}` })
    .click();
  const picker = page.getByTestId("section-picker");
  await expect(
    picker.getByRole("heading", { name: `${course} sections in Spring 2027` }),
  ).toBeFocused();
  await picker.getByRole("radio", { name: new RegExp(`CRN ${crn}`) }).check();
  await picker.getByRole("button", { name: /^Add as/ }).click();
}

test("the WebTree list: search, alternates, conflicts, keyboard reorder, copy and print", async ({
  page,
  request,
  context,
  browserName,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await newPlanner(page, request, "e2e-webtree");

  const response = await page.goto("/plan");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "My plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Next semester" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "Spring 2027 WebTree list" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No Spring 2027 choices yet" })).toBeVisible();

  // Registration dates come from the academic calendar, each tagged REGISTRAR.
  const dates = page.getByTestId("registration-deadlines");
  await expect(dates.getByRole("link", { name: /WebTree Open: Submit Spring 2027/ })).toBeVisible();
  await expect(dates).toContainText("Mon, Oct 12, 7:00a – Tue, Nov 3");
  await expect(dates).toContainText("In 12 days");
  await expect(dates).toContainText("Tue, Nov 3, 5:00p");
  await expect(dates).toContainText("Fri, Nov 6, 5:00p");
  await expect(dates).toContainText("Mon, Nov 9, 7:00a – Fri, Nov 13");
  expect(
    await untaggedRows(page, '[data-testid="registration-deadlines"] li[data-source]'),
  ).toEqual([]);
  await checkPage(page, "empty list");

  // Choice 1: CSC 221 A; choice 2: SPA 201 B (same MWF 10:30 slot); alternate for choice 1: CSC 221 B.
  await addSection(page, "data structures", "CSC 221", "20135");
  const choices = page.getByTestId("webtree-choice");
  await expect(choices).toHaveCount(1);
  await expect(page.getByTestId("webtree-status")).toHaveText(/Saved\./);
  await addSection(page, "SPA 201", "SPA 201", "20478");
  await expect(choices).toHaveCount(2);
  await page.getByRole("button", { name: "Add alternate for CSC 221 A" }).click();
  await expect(
    page.getByTestId("webtree-add").getByLabel("Search the Spring 2027 schedule"),
  ).toBeFocused();
  await expect(page.getByLabel("Add as")).toHaveValue("1");
  await addSection(page, "CSC 221", "CSC 221", "20136");
  await expect(page.getByTestId("webtree-alternate")).toHaveCount(1);
  await expect(page.getByTestId("webtree-status")).toHaveText(/Saved\./);

  // The conflict check (plan service): choice 1 and choice 2 meet at the same time.
  const conflicts = page.getByTestId("webtree-conflicts");
  await expect(conflicts).toContainText(
    "Choice 1, CSC 221 A (CRN 20135) and choice 2, SPA 201 B (CRN 20478) meet at the same time on Mon, Wed, Fri (10:30a–11:20a).",
  );
  // Per choice: seats, requirement slots and the conflict flag.
  const spanish = choices.filter({ hasText: "SPA 201" });
  await expect(spanish).toContainText("Would fill Language");
  await expect(spanish).toContainText("18 of 18 open");
  await expect(spanish).toContainText("Time conflict");

  // Keyboard reorder: Move up on SPA 201 B, focus stays with the moved choice.
  const up = page.getByRole("button", { name: "Move up SPA 201 B" });
  await up.focus();
  await page.keyboard.press("Enter");
  await expect(choices.first()).toContainText("SPA 201");
  await expect(page.getByRole("button", { name: "Move down SPA 201 B" })).toBeFocused();
  await expect(page.getByTestId("webtree-status")).toHaveText(/Saved\./);
  await page.reload();
  await expect(choices.first()).toContainText("SPA 201");

  // Promote the alternate: CSC 221 B becomes choice 2, CSC 221 A its alternate. The conflict is gone.
  await page.getByRole("button", { name: "Make choice 2 (CSC 221 B)" }).click();
  await expect(page.getByTestId("webtree-status")).toHaveText(/Saved\./);
  await expect(choices.nth(1).getByRole("heading", { level: 3 })).toContainText("CSC 221 B");
  await expect(conflicts).toContainText("alternate for choice 2, CSC 221 A");
  await expect(conflicts).toContainText("Only matters if you end up in both.");
  await checkPage(page, "list with choices");

  // Copy for WebTree: the clipboard on desktop Chromium; the selectable text is always one press away.
  const copy = page.getByTestId("copy-for-webtree");
  if (!isMobile(page) && browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await copy.getByRole("button", { name: "Copy for WebTree" }).click();
    await expect(copy).toContainText("Copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("1. CRN 20478  SPA 201 B  Developing Span Lang Hisp Cult");
  }
  await copy.getByRole("button", { name: "Show the text" }).click();
  const text = copy.getByLabel("WebTree preferences as text");
  await expect(text).toBeVisible();
  const value = await text.inputValue();
  expect(value.split("\n")).toEqual([
    "Spring 2027 WebTree preferences (from MakeItSo; unofficial: enter them in WebTree yourself)",
    "1. CRN 20478  SPA 201 B  Developing Span Lang Hisp Cult",
    "2. CRN 20136  CSC 221 B  Data Structures",
    "   Alternates: CRN 20135  CSC 221 A  Data Structures",
  ]);

  // Print view.
  await page.getByRole("link", { name: "Print view" }).click();
  await expect(page).toHaveURL(/\/plan\?tab=next&view=print$/);
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row").nth(1)).toContainText("20478");
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  await checkPage(page, "print view");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  // Remove a choice.
  await page.getByRole("link", { name: "Back to the list" }).click();
  await page.getByRole("button", { name: "Remove SPA 201 B" }).click();
  await expect(choices).toHaveCount(1);
  await expect(page.getByTestId("webtree-status")).toHaveText(/Saved\./);

  expect(errors).toEqual([]);
});

test("the WebTree list adds a course straight from the plan", async ({ page, request }) => {
  await newPlanner(page, request, "e2e-webtree-plan");
  await addItem(page, { termCode: "202602", courseCode: "CSC 221", crn: "20136" });
  await page.goto("/plan?tab=next");
  const panel = page.getByTestId("webtree-add");
  await panel.getByRole("button", { name: "Choose a section of CSC 221" }).click();
  // The plan's own section is preselected.
  await expect(page.getByRole("radio", { name: /CRN 20136/ })).toBeChecked();
  await page.getByRole("button", { name: "Add as choice 1" }).click();
  await expect(page.getByTestId("webtree-choice")).toHaveCount(1);
  await expect(page.getByTestId("webtree-choice")).toContainText(
    "Fills Mathematical and Quantitative Thought in your plan",
  );
});

test("the 4-year plan: map, statuses, P/F, move, manual entries, requirements", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await newPlanner(page, request, "e2e-fouryear");
  await addItem(page, { termCode: "202501", courseCode: "WRI 101", status: "completed" });
  await addItem(page, { termCode: "202601", courseCode: "CSC 121", status: "in-progress" });
  await addItem(page, { termCode: "202602", courseCode: "CSC 221" });

  await page.goto("/plan?tab=four-year");
  await expect(page.getByRole("link", { name: "4-year plan" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByTestId("plan-map")).toBeVisible();
  const tracker = page.getByRole("list", { name: "Requirements tracker" });
  await expect(tracker.getByRole("listitem").filter({ hasText: /^Writing \(/ })).toHaveAttribute(
    "data-status",
    "done",
  );
  await expect(page.getByText("Unofficial — verify in Degree Works.")).toBeVisible();
  await expect(page.getByTestId("credit-summary")).toContainText("1 of 32 credits done, 3 with");

  // Change CSC 221 to Pass/Fail and move it to Fall 2027.
  const spring = page.locator('[data-testid="plan-term"][data-term="202602"]');
  await spring.getByRole("button", { name: "Edit CSC 221, Spring 2027" }).click();
  await spring.getByRole("switch", { name: "Pass/Fail" }).click();
  await spring.getByLabel("Term", { exact: true }).selectOption("202701");
  await spring.getByRole("button", { name: "Save changes to CSC 221, Spring 2027" }).click();
  const fall27 = page.locator('[data-testid="plan-term"][data-term="202701"]');
  await expect(fall27.getByTestId("plan-item")).toContainText("Pass/Fail");
  await expect(spring.getByTestId("plan-item")).toHaveCount(0);

  // Mark CSC 121 completed.
  const fall26 = page.locator('[data-testid="plan-term"][data-term="202601"]');
  await fall26.getByRole("button", { name: "Edit CSC 121, Fall 2026" }).click();
  await fall26.getByLabel("Status", { exact: true }).selectOption("completed");
  await fall26.getByRole("button", { name: "Save changes to CSC 121, Fall 2026" }).click();
  await expect(fall26.getByTestId("plan-item")).toHaveAttribute("data-status", "completed");

  // A manual AP entry before Davidson.
  const manual = page.locator("#manual-entry-title").locator("xpath=ancestor::section[1]");
  await manual.getByRole("radio", { name: /AP credit/ }).check();
  await manual.getByLabel("Course code").fill("mat 113");
  await manual.getByLabel("Title").fill("Calculus II (AP)");
  await manual.getByRole("button", { name: "Add to my plan" }).click();
  const before = page.locator('[data-testid="plan-term"][data-term="none"]');
  await expect(before.getByTestId("plan-item")).toContainText("MAT 113");
  await expect(before.getByTestId("plan-item")).toContainText("AP credit");

  // Language exemption and the PE checklist.
  await page.getByRole("switch", { name: "I have language proficiency or an exemption" }).click();
  await expect(tracker.getByRole("listitem").filter({ hasText: /^Language \(/ })).toHaveAttribute(
    "data-status",
    "done",
  );
  await page.getByRole("checkbox", { name: "Team Sport course done" }).click();
  await expect(page.getByRole("checkbox", { name: "Team Sport course done" })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Team Sport course done" })).toBeChecked();

  await checkPage(page, "4-year plan");

  // Remove the AP entry.
  await before.getByRole("button", { name: "Edit MAT 113" }).click();
  await before.getByRole("button", { name: "Remove MAT 113" }).click();
  await expect(page.locator('[data-testid="plan-term"][data-term="none"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("suggestions: explained while AI is unavailable, then accepted per course", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const email = await newPlanner(page, request, "e2e-suggest");
  await page.goto("/plan?tab=suggestions");
  await expect(
    page.getByRole("heading", { name: "AI suggestions are not available" }),
  ).toBeVisible();
  await expect(page.getByTestId("ai-gate")).toContainText(/verified @davidson\.edu/i);
  await checkPage(page, "suggestions gate");

  await verifyAndConsent(page, email);
  await page.goto("/plan?tab=suggestions");
  await expect(page.getByRole("heading", { name: "No suggestions yet" })).toBeVisible();
  await page.getByRole("button", { name: "Get suggestions" }).click();
  const draft = page.getByTestId("suggestion-draft");
  await expect(draft).toBeVisible({ timeout: 30_000 });
  await expect(draft.getByText("AI · verify with your advisor")).toBeVisible();
  const rows = draft.getByTestId("suggestion");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  // Accept the first course: it is added to the plan and ticked off; set the second aside (if any).
  await rows
    .first()
    .getByRole("button", { name: /^Add to plan/ })
    .click();
  await expect(rows.first()).toHaveAttribute("data-state", "in-plan");
  await expect(rows.first()).toContainText("In your plan");
  if (count > 1) {
    await rows
      .nth(1)
      .getByRole("button", { name: /^Not for me/ })
      .click();
    await expect(rows.nth(1)).toHaveAttribute("data-state", "rejected");
    await rows.nth(1).getByRole("button", { name: /^Undo/ }).click();
    await expect(rows.nth(1)).toHaveAttribute("data-state", "pending");
  }
  await checkPage(page, "suggestions");

  const plan = (await (await page.request.get("/api/plan")).json()) as {
    plan: { items: { source: string }[] };
  };
  expect(plan.plan.items.some((item) => item.source === "ai-draft")).toBe(true);

  await page.getByRole("button", { name: "Dismiss all" }).click();
  await expect(page.getByRole("heading", { name: "No suggestions yet" })).toBeVisible();
});

test("summer plans: add, edit, remove", async ({ page, request }) => {
  await newPlanner(page, request, "e2e-summer");
  await page.goto("/plan?tab=summer");
  await expect(page.getByRole("heading", { name: "No summer plans yet" })).toBeVisible();
  const form = page.locator("#summer-add-title").locator("xpath=ancestor::section[1]");
  await form.getByLabel("Summer").selectOption("202603");
  await form.getByLabel("Title").fill("Research with Dr. Lee");
  await form.getByLabel("Kind").selectOption("research");
  await form.getByRole("button", { name: "Add summer plan" }).click();
  const rows = page.getByTestId("summer-activity");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Summer 2027");
  await expect(rows).toContainText("Research");
  await checkPage(page, "summer");

  await rows.getByRole("button", { name: "Edit Research with Dr. Lee" }).click();
  await rows.getByLabel("Organization (optional)").fill("Davidson Biology");
  await rows.getByRole("button", { name: "Save Research with Dr. Lee" }).click();
  await expect(rows).toContainText("Davidson Biology");

  await rows.getByRole("button", { name: "Remove Research with Dr. Lee" }).click();
  await expect(page.getByRole("heading", { name: "No summer plans yet" })).toBeVisible();
});

test("signed out, /plan goes to sign-in and comes back", async ({ page }) => {
  await page.goto("/plan?tab=four-year");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fplan%3Ftab%3Dfour-year/);
});

test("a legacy (hackathon) plan is shown converted, with unverified courses flagged", async ({
  page,
  request,
}) => {
  const uri = process.env.E2E_MONGODB_URI;
  test.skip(!uri, "needs E2E_MONGODB_URI to write the legacy document");
  const email = await newPlanner(page, request, "e2e-legacy");
  const { MongoClient, ObjectId } = await import("mongodb");
  const client = new MongoClient(uri!);
  try {
    await client.connect();
    const db = client.db();
    const user = await db.collection("users").findOne({ email });
    expect(user).not.toBeNull();
    await db.collection("courseplans").insertOne({
      userId: new ObjectId(String(user!._id)),
      plannedCourses: [
        {
          courseCode: "CSC 121",
          courseName: "Intro",
          credits: 4,
          semester: "Fall",
          year: 2025,
          status: "completed",
        },
        {
          courseCode: "FAKE 999",
          courseName: "Invented Course",
          credits: 4,
          semester: "Spring",
          year: 2027,
          status: "planned",
        },
      ],
      summerActivities: [],
      totalCreditsCompleted: 0,
      totalCreditsPlanned: 0,
      createdAt: new Date("2026-02-21T12:00:00Z"),
      updatedAt: new Date("2026-03-01T12:00:00Z"),
    });
  } finally {
    await client.close();
  }
  await page.goto("/plan?tab=four-year");
  await expect(page.getByTestId("legacy-plan")).toContainText(
    "Converted from your earlier MakeItSo plan",
  );
  const fake = page.locator('[data-testid="plan-item"][data-unverified="true"]');
  await expect(fake).toContainText("FAKE 999");
  await expect(fake).toContainText("Not found in the Davidson catalog — edit or remove");
  await expect(
    page.locator('[data-testid="plan-item"]').filter({ hasText: "CSC 121" }),
  ).toContainText("1 credit");
  await checkPage(page, "legacy plan");
  // The first change writes v2: remove the invented course.
  await fake.getByRole("button", { name: /^Edit FAKE 999/ }).click();
  await fake.getByRole("button", { name: /^Remove FAKE 999/ }).click();
  await expect(page.locator('[data-testid="plan-item"][data-unverified="true"]')).toHaveCount(0);
  const plan = (await (await page.request.get("/api/plan", { headers: SAME_ORIGIN })).json()) as {
    plan: { legacy: boolean };
  };
  expect(plan.plan.legacy).toBe(false);
});
