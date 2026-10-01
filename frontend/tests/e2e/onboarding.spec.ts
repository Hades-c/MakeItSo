import AxeBuilder from "@axe-core/playwright";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { collectErrors, registerViaApi, signIn, uniqueEmail } from "./helpers";

/**
 * /onboarding (W9b-2) end to end against the real profile (W3), catalog (W1, fixtures) and plan (W5s) routes, at
 * desktop 1440 and phone 390: the whole first run with axe on every step and no sideways scrolling, resuming, a
 * re-run that adds nothing twice, Skip setup, and a legacy account whose v1 plan shows up in the steps.
 */

const PASSWORD = "onboarding e2e password";

interface PlanItemBody {
  termCode: string | null;
  courseCode: string;
  crn?: string;
  status: string;
  source: string;
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** The step renders, is accessible in light and dark, and never scrolls sideways. */
async function checkStep(page: Page, heading: string) {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(await horizontalOverflow(page), `${heading}: scrolls sideways`).toBeLessThanOrEqual(0);
    expect(await seriousViolations(page), `${heading}: axe ${colorScheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function newStudent(page: Page, request: APIRequestContext, prefix: string) {
  const email = uniqueEmail(prefix);
  await registerViaApi(request, { name: "Casey Wildcat", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
  return email;
}

async function planItems(page: Page): Promise<PlanItemBody[]> {
  const res = await page.request.get("/api/plan");
  expect(res.status()).toBe(200);
  return ((await res.json()) as { plan: { items: PlanItemBody[] } }).plan.items;
}

function keys(items: PlanItemBody[]) {
  return items
    .map(
      (item) => `${item.termCode ?? "none"} ${item.courseCode} ${item.crn ?? "-"} ${item.status}`,
    )
    .sort();
}

async function searchFor(page: Page, label: RegExp, text: string) {
  const box = page.getByLabel(label);
  await box.fill(text);
  await box.press("Enter");
  await expect(page.getByTestId("search-result").first()).toBeVisible();
}

async function pickClasses(page: Page) {
  // One section: added with its CRN straight away (auto-select).
  await searchFor(page, /Search Fall 2026 courses/, "HIS 357");
  await page.getByRole("button", { name: "Add for HIS 357" }).click();
  await expect(page.getByTestId("classes-status")).toContainText("Added HIS 357 A");
  // Several sections: pick one.
  await searchFor(page, /Search Fall 2026 courses/, "CSC 121");
  await page.getByRole("button", { name: "Choose section for CSC 121" }).click();
  await page.getByLabel(/CSC 121 B/).check();
  await page.getByRole("button", { name: "Save section" }).click();
  await expect(page.getByTestId("classes-status")).toContainText("Added CSC 121 B (CRN 10142)");
}

test("a new student completes every step, accessibly, and lands on Today", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await newStudent(page, request, "e2e-onboarding");

  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding\?step=about$/);
  await checkStep(page, "About you");
  await page.getByLabel("Graduation year").selectOption("2029");
  await expect(page.getByLabel("First term at Davidson")).toHaveValue("202501");
  await page.getByLabel("Major", { exact: true }).selectOption("Major in History (A.B. Degree)");
  await page.getByRole("button", { name: "Add a minor" }).click();
  await page.getByLabel("Minor", { exact: true }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\?step=classes$/);
  await checkStep(page, "Your Fall 2026 classes");
  await pickClasses(page);
  await checkStep(page, "Your Fall 2026 classes");
  await page.getByRole("link", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\?step=completed$/);
  await checkStep(page, "Courses you have taken");
  await expect(page.getByLabel("Term you took it")).toHaveValue("202502");
  await searchFor(page, /Search Spring 2026 courses/, "WRI 101");
  await page.getByRole("button", { name: "Mark WRI 101 completed" }).click();
  await expect(page.getByTestId("completed-status")).toContainText("Added WRI 101 (Spring 2026)");
  await page.getByLabel("Davidson course code").fill("mat113");
  await page.getByRole("button", { name: "Add credit" }).click();
  await expect(page.getByTestId("completed-status")).toContainText("Added MAT 113 (AP or IB");
  await page.getByRole("link", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\?step=interests$/);
  await checkStep(page, "Interests");
  await page.getByRole("button", { name: "Software Engineering" }).click();
  await expect(page.getByRole("button", { name: "Software Engineering" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/today$/);

  const profile = (await (await page.request.get("/api/profile")).json()) as {
    profile: Record<string, unknown>;
  };
  expect(profile.profile).toMatchObject({
    graduationYear: 2029,
    firstTerm: "202501",
    majors: ["Major in History (A.B. Degree)"],
    interests: ["software-engineering"],
    onboardedAt: "2026-09-30T16:00:00.000Z",
  });
  expect((profile.profile.minors as string[]).length).toBe(1);
  const before = keys(await planItems(page));
  expect(before).toEqual([
    "202502 WRI 101 - completed",
    "202601 CSC 121 10142 in-progress",
    "202601 HIS 357 10274 in-progress",
    "none MAT 113 - completed",
  ]);

  // A re-run starts at the beginning, shows what is saved, and adds nothing twice.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding\?step=about$/);
  await expect(page.getByRole("button", { name: "Skip setup" })).toHaveCount(0);
  await page.getByRole("link", { name: /Step 2: Your Fall 2026 classes/ }).click();
  await expect(page.getByTestId("current-classes").getByTestId("plan-item")).toHaveCount(2);
  await searchFor(page, /Search Fall 2026 courses/, "HIS 357");
  await expect(page.getByTestId("search-result").first()).toContainText(
    "In your classes (CRN 10274)",
  );
  await searchFor(page, /Search Fall 2026 courses/, "CSC 121");
  await page.getByRole("button", { name: "Change section for CSC 121" }).click();
  await expect(page.getByLabel(/CSC 121 B/)).toBeChecked();
  await page.getByRole("button", { name: "Save section" }).click();
  await expect(page.getByTestId("classes-status")).toContainText("already in your Fall 2026");
  await page.getByRole("link", { name: "Continue" }).click();
  await searchFor(page, /Search Spring 2026 courses/, "WRI 101");
  await expect(page.getByTestId("search-result").first()).toContainText("Completed in Spring 2026");
  await page.getByLabel("Davidson course code").fill("MAT 113");
  await page.getByRole("button", { name: "Add credit" }).click();
  await expect(page.getByText("MAT 113 is already listed for that term.")).toBeVisible();
  expect(keys(await planItems(page))).toEqual(before);
  expect(errors).toEqual([]);
});

test("onboarding resumes where the student stopped, and every step can be skipped", async ({
  page,
  request,
}) => {
  await newStudent(page, request, "e2e-onboarding-resume");
  await page.goto("/onboarding?step=about");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/onboarding\?step=classes$/);

  await page.goto("/today");
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding\?step=classes$/);
  await page.getByRole("link", { name: "Skip this step" }).click();
  await expect(page).toHaveURL(/\/onboarding\?step=completed$/);
  await page.getByRole("link", { name: "Skip this step" }).click();
  await expect(page).toHaveURL(/\/onboarding\?step=interests$/);
  await expect(page.getByRole("link", { name: "Skip this step" })).toHaveCount(0);
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/onboarding\?step=completed$/);
});

test("Skip setup finishes onboarding without saving anything else", async ({ page, request }) => {
  await newStudent(page, request, "e2e-onboarding-skip");
  await page.goto("/onboarding?step=about");
  await page.getByRole("button", { name: "Skip setup" }).click();
  await expect(page).toHaveURL(/\/today$/);
  const { profile } = (await (await page.request.get("/api/profile")).json()) as {
    profile: { onboardedAt: string | null; firstTerm: string | null; majors: string[] };
  };
  expect(profile.onboardedAt).not.toBeNull();
  expect(profile.firstTerm).toBeNull();
  expect(profile.majors).toEqual([]);
  expect(await planItems(page)).toEqual([]);
});

test("signed-out visitors sign in and come back to the same step", async ({ page }) => {
  await page.goto("/onboarding?step=completed");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fonboarding%3Fstep%3Dcompleted$/);
});

test("a legacy account sees its v1 plan in the steps and gets a CRN without duplicates", async ({
  page,
}) => {
  const uri = process.env.E2E_MONGODB_URI;
  test.skip(
    !uri,
    "needs E2E_MONGODB_URI: the hackathon-era account and its v1 plan are written to the database",
  );
  const email = `e2e-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@gmail.com`;
  const conn = await mongoose.createConnection(uri!).asPromise();
  let v1Before: unknown;
  try {
    const { insertedId } = await conn.collection("users").insertOne({
      name: "Legacy Friend",
      email,
      password: await bcrypt.hash(PASSWORD, 4),
      major: "Computer Science",
      graduationYear: 2029,
      createdAt: new Date("2026-02-01T12:00:00Z"),
      updatedAt: new Date("2026-02-01T12:00:00Z"),
    });
    await conn.collection("courseplans").insertOne({
      userId: insertedId,
      plannedCourses: [
        {
          _id: new mongoose.Types.ObjectId(),
          courseId: new mongoose.Types.ObjectId(),
          courseCode: "csc 121",
          courseName: "Intro to CS",
          credits: 4,
          semester: "Fall",
          year: 2026,
          status: "planned",
        },
        {
          _id: new mongoose.Types.ObjectId(),
          courseId: new mongoose.Types.ObjectId(),
          courseCode: "WRI 101",
          courseName: "Writing",
          credits: 4,
          semester: "Spring",
          year: 2026,
          status: "completed",
        },
      ],
      summerActivities: [],
      createdAt: new Date("2026-02-21T12:00:00Z"),
      updatedAt: new Date("2026-03-01T12:00:00Z"),
    });
    v1Before = await conn.collection("courseplans").findOne({ userId: insertedId });
  } finally {
    await conn.close();
  }

  await signIn(page, email, PASSWORD);
  // Classes and completed courses are already there (from v1): resume at the interests step.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding\?step=interests$/);
  await page.goto("/onboarding?step=about");
  await expect(page.getByLabel("Major", { exact: true })).toHaveValue(
    "Major in Computer Science (B.S. Degree)",
  );

  await page.goto("/onboarding?step=classes");
  await expect(
    page.getByText("These include courses from your earlier MakeItSo plan"),
  ).toBeVisible();
  const current = page.getByTestId("current-classes");
  await expect(current.getByTestId("plan-item")).toHaveCount(1);
  await expect(current).toContainText("No section chosen");
  await checkStep(page, "Your Fall 2026 classes");
  await searchFor(page, /Search Fall 2026 courses/, "CSC 121");
  await page.getByRole("button", { name: "Choose section for CSC 121" }).click();
  await page.getByLabel(/CSC 121 A/).check();
  await page.getByRole("button", { name: "Save section" }).click();
  await expect(page.getByTestId("classes-status")).toContainText("CSC 121 is now section A");

  expect(keys(await planItems(page))).toEqual([
    "202502 WRI 101 - completed",
    "202601 CSC 121 10141 planned",
  ]);
  const check = await mongoose.createConnection(uri!).asPromise();
  try {
    const user = await check.collection("users").findOne({ email });
    expect(await check.collection("courseplans").findOne({ userId: user!._id })).toEqual(v1Before);
  } finally {
    await check.close();
  }
});
