import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  collectErrors,
  horizontalOverflow,
  isMobile,
  newSignedInAccount,
  seriousViolations,
  smallTapTargets,
} from "./helpers";

/**
 * The Davidson Connect preview (/alumni/preview): fictional sample profiles for pitching, reached from the Careers
 * header and from each career page. Any signed-in student (here an unverified one: the preview holds no personal
 * data). Checks the notice, the Sample badge and disabled actions on every card, the URL filters, axe in light and
 * dark, and no sideways scroll at 390px. Runs at desktop 1440 and phone 390.
 *
 * Screenshots (1440/390 light, 1440 dark) when ALUMNI_SHOTS_DIR is set.
 */

const NOTICE = "Davidson Connect preview · sample data";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.ALUMNI_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const width = page.viewportSize()?.width ?? 1440;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, `${name}-${width}.png`), fullPage: true });
}

async function tap(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
  if (isMobile(page)) await locator.tap();
  else await locator.click();
}

async function checkPage(page: Page, label: string): Promise<void> {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    expect(await seriousViolations(page), `${label}: axe ${colorScheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
  expect(await horizontalOverflow(page), `${label}: overflow`).toBeLessThanOrEqual(0);
  if (isMobile(page)) expect(await smallTapTargets(page), `${label}: tap targets`).toEqual([]);
}

test("Careers opens the preview: notice first, Sample on every card, nothing sends, filters work", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await newSignedInAccount(page, request, "e2e-alumni-preview");

  await page.goto("/careers");
  const header = page.locator("main header");
  // Apart from the verified directory, and named as the preview.
  await expect(header.getByRole("link", { name: "Alumni", exact: true })).toHaveAttribute(
    "href",
    "/alumni",
  );
  await tap(page, header.getByRole("link", { name: "Davidson Connect preview · sample data" }));
  await expect(page).toHaveURL(/\/alumni\/preview$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Davidson Connect preview" }),
  ).toBeVisible();

  // Careers is the current section (sidebar or tab bar), never the verified Alumni directory.
  const current = page.locator('a[aria-current="page"]:visible');
  await expect(current.first()).toBeVisible();
  expect(await current.evaluateAll((links) => links.map((l) => l.getAttribute("href")))).toEqual(
    expect.arrayContaining(["/careers"]),
  );
  await expect(page.locator('a[aria-current="page"][href="/alumni"]')).toHaveCount(0);

  const notice = page.getByRole("note", { name: NOTICE });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("These are fictional profiles");
  await expect(notice).toContainText("They are not real alumni.");
  await expect(notice.getByRole("button")).toHaveCount(0);
  // Above the filters and every card.
  const noticeBox = (await notice.boundingBox())!;
  const formBox = (await page.getByRole("form", { name: "Filter sample profiles" }).boundingBox())!;
  expect(noticeBox.y).toBeLessThan(formBox.y);

  const cards = page.locator("[data-sample-alumnus]");
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(24);
  await expect(page.getByTestId("sample-count")).toHaveText(`${total} sample profiles`);
  await expect(page.getByTestId("sample-badge")).toHaveCount(total);
  await expect(page.locator("[data-alumnus]")).toHaveCount(0);
  await expect(page.locator("main img")).toHaveCount(0);
  for (const name of ["Connect", "Message"]) {
    const buttons = page.getByRole("button", { name, exact: true });
    await expect(buttons).toHaveCount(total);
    await expect(buttons.first()).toBeDisabled();
    await expect(buttons.first()).toHaveAccessibleDescription(
      "Not available: MakeItSo is not connected to Davidson Connect",
    );
  }
  await shot(page, "preview");
  await checkPage(page, "/alumni/preview");
  if (!isMobile(page)) {
    await page.emulateMedia({ colorScheme: "dark" });
    await shot(page, "preview-dark");
    await page.emulateMedia({ colorScheme: "light" });
  }

  // A GET form: the URL holds the filters.
  await page.getByLabel("Industry").selectOption("health-care");
  await tap(page, page.getByRole("button", { name: "Apply" }));
  await expect(page).toHaveURL(/\/alumni\/preview\?.*industry=health-care/);
  const health = await cards.count();
  expect(health).toBeGreaterThan(0);
  expect(health).toBeLessThan(total);
  await expect(page.getByTestId("sample-count")).toHaveText(
    `Showing ${health} of ${total} sample profiles`,
  );
  for (const card of await cards.all()) await expect(card).toContainText("Health care");

  await page.getByLabel("Class year").selectOption("2011");
  await tap(page, page.getByRole("button", { name: "Apply" }));
  await expect(page).toHaveURL(/year=2011/);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("2011");

  await tap(page, page.getByRole("link", { name: "Clear filters" }).first());
  await expect(page).toHaveURL(/\/alumni\/preview$/);
  await expect(cards).toHaveCount(total);
  expect(errors).toEqual([]);
});

test("a career page opens its path's sample profiles, apart from the verified alumni", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await newSignedInAccount(page, request, "e2e-alumni-preview-career");

  await page.goto("/careers/law");
  const card = page.getByRole("region", { name: /Davidson Connect preview/ });
  await expect(card).toContainText("Sample data");
  await expect(card).toContainText("They are not real alumni.");
  // The preview card shows no profile itself.
  await expect(card.locator("[data-sample-alumnus], [data-alumnus]")).toHaveCount(0);
  await expect(page.locator("[data-sample-alumnus]")).toHaveCount(0);
  await shot(page, "career-law");
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);

  const link = card.getByRole("link", { name: /sample profiles? on this path/ });
  await tap(page, link);
  await expect(page).toHaveURL(/\/alumni\/preview\?career=law$/);
  await expect(page.getByRole("note", { name: NOTICE })).toBeVisible();
  await expect(page.getByLabel("Career path")).toHaveValue("law");
  const cards = page.locator("[data-sample-alumnus]");
  expect(await cards.count()).toBeGreaterThan(0);
  for (const sample of await cards.all()) {
    await expect(sample.getByRole("link", { name: "Law", exact: true })).toBeVisible();
  }
  await shot(page, "preview-law");
  await checkPage(page, "/alumni/preview?career=law");
  expect(errors).toEqual([]);
});
