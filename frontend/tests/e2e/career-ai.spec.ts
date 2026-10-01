import { expect, test, type Page } from "@playwright/test";
import {
  aiStudent,
  collectErrors,
  expectAllTagged,
  horizontalOverflow,
  isMobile,
  seriousViolations,
  smallTapTargets,
} from "./helpers";

/**
 * The AI panels on /careers/[slug] (W9a-ai) against the production build with AI_PROVIDER=mock and fixtures
 * (server "now" 2026-09-30): the gate for an unverified account, the career plan with catalog titles and "Send
 * to my plan" (→ a pending draft in My plan → Suggestions), and the cold e-mail to a contactable alumnus with
 * {{studentName}} filled in the browser. Desktop 1440 and phone 390, each in light and dark, plus a 360px pass;
 * driven by the keyboard so focus is checked to stay in the panel (WCAG 2.4.3).
 */

const PASSWORD = "career ai e2e password 7";

/** axe in light and dark, overflow and tap targets at the project viewport and at 360x800. */
async function checkLayout(page: Page, label: string) {
  // From the top of the page: axe's target-size counts a control half under the sticky top bar (where the last
  // action scrolled it) as too small, which says nothing about the control itself.
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(await seriousViolations(page), `${label}: axe ${colorScheme}`).toEqual([]);
    expect(await horizontalOverflow(page), `${label}: overflow ${colorScheme}`).toBeLessThanOrEqual(
      0,
    );
  }
  if (isMobile(page)) {
    expect(await smallTapTargets(page), `${label}: tap targets under 44px`).toEqual([]);
  }
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await horizontalOverflow(page), `${label}: overflow at 360`).toBeLessThanOrEqual(0);
  expect(await smallTapTargets(page), `${label}: tap targets under 44px at 360`).toEqual([]);
  if (viewport) await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: "light" });
}

/** Focus is inside `region` (never dropped to <body>). */
async function expectFocusWithin(region: ReturnType<Page["getByRole"]>) {
  await expect
    .poll(() => region.evaluate((el) => el.contains(document.activeElement)), {
      message: "focus stays in the panel",
    })
    .toBe(true);
}

function newStudent(
  page: Page,
  prefix: string,
  name: string,
  opts: { verified: boolean; consent: boolean },
) {
  return aiStudent(page, prefix, name, { ...opts, password: PASSWORD });
}

test("an unverified account sees why AI is closed, with the verify step, and no alumni", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await newStudent(page, "e2e-cai-unv", "Uma Unverified", { verified: false, consent: false });
  expect((await page.goto("/careers/medicine"))?.status()).toBe(200);
  const notice = page.getByTestId("ai-shared-gate");
  await expect(notice).toContainText("limited to verified @davidson.edu accounts");
  await expect(notice.getByRole("link", { name: "Verify your email" })).toHaveAttribute(
    "href",
    "/verify?reason=davidson&next=%2Fcareers%2Fmedicine",
  );
  await expect(page.getByRole("button", { name: "Draft my career plan" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Who would you like to write to?" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the AI career plan: official titles and availability, then Send to my plan → Suggestions", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await newStudent(page, "e2e-cai-plan", "Pat Planner", { verified: true, consent: true });
  expect((await page.goto("/careers/software-engineering"))?.status()).toBe(200);

  const card = page.getByRole("region", { name: /^Your AI career plan/ });
  // Keyboard: focus stays in the panel while drafting and lands on the plan when it arrives.
  await card.getByRole("button", { name: "Draft my career plan" }).focus();
  await page.keyboard.press("Enter");
  await expectFocusWithin(card);
  const result = card.getByTestId("ai-career-plan-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toBeFocused();
  await expect(result.getByText("AI-generated content: verify with your advisor")).toBeAttached();
  await expect(result.getByTestId("ai-plan-overview")).not.toBeEmpty();

  const picks = result.getByTestId("ai-course-pick");
  const pickCount = await picks.count();
  expect(pickCount).toBeGreaterThan(0);
  // Each pick gets its official title from the catalog and a term status with its COURSE SCHEDULE tag.
  const first = picks.first();
  await expect(first.getByTestId("ai-course-title")).toBeVisible();
  await expect(first.getByTestId("ai-course-term")).toHaveText(
    /^(Offered in|Not offered in|\w+ \d{4}(:| isn’t))/,
  );
  await expect(page.getByText("Checking the schedule…")).toHaveCount(0);
  expect(await expectAllTagged(page)).toBeGreaterThan(0);
  // Official program names are shown as they are (never "Major · Major in …").
  await expect(result.getByText(/Major · Major|Minor · Minor/)).toHaveCount(0);

  await checkLayout(page, "plan");

  // Draft a new plan by keyboard: focus never drops to <body>, and comes back to the new plan.
  await card.getByRole("button", { name: "Draft a new plan" }).focus();
  await page.keyboard.press("Enter");
  await expectFocusWithin(card);
  await expect(card.getByRole("button", { name: "Draft a new plan" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(result).toBeFocused();
  await expect(card.getByText(/shared by your plan and your emails/)).toBeVisible();

  await result.getByRole("button", { name: "Send to my plan" }).click();
  await expect(page).toHaveURL(/\/plan\?tab=suggestions$/);

  const drafts = await page.request.get("/api/plan/drafts");
  expect(drafts.status()).toBe(200);
  expect(drafts.headers()["cache-control"]).toBe("private, no-store");
  const { drafts: list } = (await drafts.json()) as {
    drafts: { kind: string; status: string; items: unknown[] }[];
  };
  expect(list[0]).toMatchObject({ kind: "career-plan", status: "pending" });
  expect(list[0]!.items.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("cold email: contactable alumni only, the student's name filled in the browser, copied", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await newStudent(page, "e2e-cai-mail", "Quinn Coldmail", { verified: true, consent: true });
  expect((await page.goto("/careers/medicine"))?.status()).toBe(200);

  const card = page.getByRole("region", { name: /^Email an alumnus/ });
  const group = card.getByRole("group", { name: "Who would you like to write to?" });
  await expect(group.getByRole("radio", { name: /Rahael Borchers/ })).toBeVisible();
  // Notable alumni (public figures, trustees, college officers) are never offered a cold email.
  await expect(group.getByText("Sallie Permar")).toHaveCount(0);
  await expect(group.getByText("Thomas Marshburn")).toHaveCount(0);

  await expect(card.getByTestId("alumni-provenance")).toContainText("Compiled from public sources");

  await group.getByText("Rahael Borchers").click();
  await card.getByRole("button", { name: "Draft an email" }).focus();
  await page.keyboard.press("Enter");
  await expectFocusWithin(card);
  const result = card.getByTestId("ai-email-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toBeFocused();
  const body = result.getByTestId("ai-email-body");
  await expect(body).toContainText("Dear Rahael Borchers");
  await expect(body).toContainText("Quinn Coldmail");
  await expect(body).not.toContainText("{{studentName}}");

  await result.getByRole("button", { name: "Copy email" }).click();
  await expect(card.getByTestId("ai-copy-status")).toHaveText("The email is on your clipboard.");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Subject: /);
  expect(copied).toContain("Quinn Coldmail");

  await checkLayout(page, "email");
  expect(errors).toEqual([]);
});
