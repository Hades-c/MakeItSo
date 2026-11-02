import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  aiStudent,
  collectErrors,
  expectAllAttributed,
  horizontalOverflow,
  isMobile,
  SAME_ORIGIN,
  seriousViolations,
  smallTapTargets,
} from "./helpers";

/**
 * "Your AI summer picks" on /careers/[slug] (owner request 2026-11-02) against the production build with
 * AI_PROVIDER=mock and fixtures (server "now" 2026-09-30): the panel right after the Summers card, picks whose
 * names, pages and For / Timing lines are the Summers content's, the AI's words under the AI chip, an honest
 * outlook for a first-year and for a junior, a path with no summers of its own (sports-management), and an account
 * without AI (no panel: the shared "AI for this path" notice says it once). Desktop 1440 and phone 390, light and
 * dark, plus a 360px pass; driven by the keyboard so focus is checked to stay in the panel. With SUMMERS_SHOTS_DIR set, each state is saved there.
 */

const PASSWORD = "career summers e2e password 3";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SUMMERS_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const width = page.viewportSize()?.width ?? 1440;
  const card = page.getByRole("region", { name: /^Your AI summer picks/ });
  await card.scrollIntoViewIfNeeded();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    // The sticky top bar and the phone tabs would sit over a tall card in an element screenshot.
    await card.screenshot({
      path: path.join(dir, `${name}-${width}-${colorScheme}.png`),
      style: "header.sticky, .fixed.bottom-0 { visibility: hidden !important; }",
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** axe in light and dark, overflow and tap targets at the project viewport and at 360x800. */
async function checkLayout(page: Page, label: string) {
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

async function student(page: Page, prefix: string, name: string, graduationYear: number) {
  await aiStudent(page, prefix, name, { verified: true, consent: true, password: PASSWORD });
  const res = await page.request.patch("/api/profile", {
    data: { graduationYear, interests: ["software-engineering"] },
    headers: SAME_ORIGIN,
  });
  expect(res.status()).toBe(200);
}

test("a first-year's summer picks: after the Summers card, from its content, honest about the year", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  // Class of 2030: a first-year in Fall 2026, so the coming summer is after the first year.
  await student(page, "e2e-sum-fy", "Frankie Firstyear", 2030);
  expect((await page.goto("/careers/software-engineering"))?.status()).toBe(200);

  // Right after the Summers card (and On campus beside it), before the alumni and the other AI panels.
  const order = await page.evaluate(() =>
    ["summers-title", "ai-summers-title", "ai-career-plan-title"].map((id) => {
      const el = document.getElementById(id);
      return el ? [...document.querySelectorAll("[id]")].indexOf(el) : -1;
    }),
  );
  expect(order[0]).toBeGreaterThanOrEqual(0);
  expect(order[1]).toBeGreaterThan(order[0]!);
  expect(order[2]).toBeGreaterThan(order[1]!);

  const card = page.getByRole("region", { name: /^Your AI summer picks/ });
  await expect(card.getByText(/Your name and email are never sent to the AI/)).toBeVisible();
  await shot(page, "idle");
  await card.getByRole("button", { name: "Suggest summers for me" }).focus();
  await page.keyboard.press("Enter");
  const result = card.getByTestId("ai-summers-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toBeFocused();
  await expect(result.getByText("AI-generated content: verify with your advisor")).toBeAttached();
  await expect(result.getByTestId("ai-summers-outlook")).toContainText("After your first year");

  const picks = result.getByTestId("ai-summer-pick");
  expect(await picks.count()).toBeGreaterThan(0);
  // Each pick's name and page are the Summers card's own (content), never the model's.
  const summers = page.getByTestId("career-summers");
  const first = picks.first();
  const firstLink = first.getByRole("link").first();
  const name = ((await firstLink.textContent()) ?? "").replace("(opens in a new tab)", "").trim();
  const href = await firstLink.getAttribute("href");
  await expect(
    summers.getByRole("link", { name: new RegExp(`^${name.replace(/[.()]/g, "\\$&")}`) }),
  ).toHaveAttribute("href", href!);
  await expect(first.getByText("· in Summers above")).toBeVisible();
  await expect(first.getByTestId("ai-summer-why")).not.toBeEmpty();
  await expect(result.getByTestId("ai-summers-facts-line")).toContainText(
    "Confirm on the program’s page before you apply.",
  );

  await expectAllAttributed(page);
  await checkLayout(page, "picks");
  await shot(page, "picks");

  // Pick again by keyboard: focus never drops to <body> and comes back to the new picks.
  await card.getByRole("button", { name: "Pick again" }).focus();
  await page.keyboard.press("Enter");
  await expect(card.getByRole("button", { name: "Pick again" })).toBeVisible({ timeout: 30_000 });
  await expect(result).toBeFocused();
  await expect(
    card.getByText(/shared by your plan, your emails and your summer picks/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a junior on a path with no summers of its own gets Davidson programs for any path", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await student(page, "e2e-sum-jr", "Jordan Junior", 2028);
  expect((await page.goto("/careers/sports-management"))?.status()).toBe(200);
  await expect(page.getByTestId("career-summers")).toHaveCount(0);

  const card = page.getByRole("region", { name: /^Your AI summer picks/ });
  await card.getByRole("button", { name: "Suggest summers for me" }).click();
  const result = card.getByTestId("ai-summers-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result.getByTestId("ai-summers-outlook")).toContainText("After your junior year");
  const picks = result.getByTestId("ai-summer-pick");
  expect(await picks.count()).toBeGreaterThan(0);
  await expect(result.getByText("· in Summers above")).toHaveCount(0);
  await expect(picks.first().getByText("via Matthews Center")).toBeVisible();
  await expectAllAttributed(page);
  await checkLayout(page, "sports");
  await shot(page, "no-own-summers");
  expect(errors).toEqual([]);
});

test("without AI turned on, the page says so once, in the AI for this path card", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await aiStudent(page, "e2e-sum-off", "Casey Noconsent", {
    verified: true,
    consent: false,
    password: PASSWORD,
  });
  expect((await page.goto("/careers/law"))?.status()).toBe(200);
  // The summer picks share the career plan's gate, so only the shared card carries the notice.
  await expect(page.getByRole("region", { name: /^AI for this path/ })).toBeVisible();
  await expect(page.getByText("Turn on AI features first")).toHaveCount(1);
  const gate = page.getByTestId("ai-shared-gate");
  await expect(gate).toContainText("Turn on AI features first");
  await expect(gate.getByRole("link", { name: "Open AI settings" })).toHaveAttribute(
    "href",
    "/profile#ai-features",
  );
  await expect(page.getByRole("region", { name: /^Your AI summer picks/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Suggest summers for me" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
