import { expect, test, type Page } from "@playwright/test";
import { collectErrors, isMobile, seriousViolations } from "./helpers";

/**
 * The dev-only component gallery (app/design). Production builds (the normal e2e run) must answer 404. Against a
 * dev server, run with E2E_DEV_SERVER=1 to check it for accessibility in both themes:
 *
 *   npx next dev -p 3202 &
 *   E2E_PORT=3202 E2E_REUSE_SERVER=1 E2E_DEV_SERVER=1 npx playwright test design-gallery
 */
const DEV_SERVER = !!process.env.E2E_DEV_SERVER;

test("the design gallery is not served by production builds", async ({ page }) => {
  test.skip(DEV_SERVER, "dev server: the gallery is served");
  const response = await page.goto("/design");
  expect(response?.status()).toBe(404);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the design gallery has no serious accessibility problems (${colorScheme})`, async ({
    page,
  }) => {
    test.skip(!DEV_SERVER, "the gallery exists only on a dev server (E2E_DEV_SERVER=1)");
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const response = await page.goto("/design");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wednesday, September 30");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      colorScheme,
    );

    // Every component is on the page.
    await expect(page.getByTestId("day-timeline").first()).toBeVisible();
    await expect(page.getByTestId("plan-map").first()).toBeVisible();
    await expect(page.getByTestId("week-grid").first()).toBeVisible();
    await expect(page.getByTestId("requirement-slots").first()).toBeVisible();
    await expect(page.getByTestId("add-to-plan").first()).toBeVisible();

    // The right layout for the width: day tabs and year rows on phones, the grid and one row on desktop.
    const week = page.getByTestId("week-grid").first();
    await expect(week.locator('[data-layout="tabs"]')).toBeVisible({ visible: isMobile(page) });
    await expect(week.locator('[data-layout="grid"]')).toBeVisible({ visible: !isMobile(page) });
    const plan = page.getByTestId("plan-map").first();
    await expect(plan.locator('[data-layout="years"]')).toBeVisible({ visible: isMobile(page) });

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);

    // Nothing below the 12px type floor.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("main *")]
        .filter(
          (el) =>
            el.childNodes.length &&
            [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()),
        )
        .filter((el) => {
          const s = getComputedStyle(el);
          return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.fontSize) < 12;
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(small).toEqual([]);

    expect(await seriousViolations(page)).toEqual([]);

    // The palette with sample results, open.
    await page.getByRole("button", { name: "Open the palette with sample results" }).click();
    const dialog = page.getByRole("dialog", { name: "Search MakeItSo" });
    await expect(dialog.getByRole("group", { name: "Courses" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    expect(await seriousViolations(page, '[role="dialog"]')).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // Focus goes back to the button that opened it.
    await expect(
      page.getByRole("button", { name: "Open the palette with sample results" }),
    ).toBeFocused();

    expect(errors).toEqual([]);
  });
}

/** Text in timeline items that sits under the now pill or a deadline label (should be none). */
function coveredText(page: Page) {
  return page.evaluate(() => {
    const hits: string[] = [];
    const shown = (el: Element) => el.checkVisibility() && !el.closest(".sr-only");
    for (const timeline of document.querySelectorAll('[data-testid="day-timeline"]')) {
      const covers = [
        ...timeline.querySelectorAll('[data-testid="now-pill"], [data-testid="deadline-label"]'),
      ].filter(shown);
      const texts = [...timeline.querySelectorAll("li[data-kind] *")].filter(
        (el) =>
          shown(el) &&
          [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()),
      );
      for (const cover of covers) {
        const c = cover.getBoundingClientRect();
        for (const text of texts) {
          if (cover.contains(text)) continue;
          const t = text.getBoundingClientRect();
          const overlap =
            Math.min(c.right, t.right) - Math.max(c.left, t.left) > 1 &&
            Math.min(c.bottom, t.bottom) - Math.max(c.top, t.top) > 1;
          if (overlap)
            hits.push(`${cover.textContent?.trim()} covers "${text.textContent?.trim()}"`);
        }
      }
    }
    return hits;
  });
}

/** Source tags and deadline titles cut short with an ellipsis (should be none). */
function cutShort(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('span[data-source], [data-testid="deadline-title"]')]
      .filter((el) => el.checkVisibility() && el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.textContent?.trim()} ${el.clientWidth}/${el.scrollWidth}`),
  );
}

test("timeline text is never covered, and tags and deadline titles are never cut short", async ({
  page,
}) => {
  test.skip(!DEV_SERVER, "the gallery exists only on a dev server (E2E_DEV_SERVER=1)");
  const widths = isMobile(page) ? [390, 360] : [1440];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/design");
    await expect(page.getByTestId("now-pill").first()).toBeVisible();
    // The gallery has now during a class (10:45, CSC 221 A) and a deadline during it (11:00).
    await expect(page.getByTestId("deadline-list")).toContainText("Reading quiz (sample)");
    expect(await coveredText(page), `at ${width}px`).toEqual([]);
    expect(await cutShort(page), `at ${width}px`).toEqual([]);
    if (width < 720) {
      // Three overlapping items become one block, listed in full below.
      await expect(page.getByTestId("overlap-group").first()).toBeVisible();
      await expect(page.getByTestId("overlap-list").first()).toBeVisible();
    }
  }
});

test("day tabs and term choice work by touch and keyboard", async ({ page }) => {
  test.skip(!DEV_SERVER, "the gallery exists only on a dev server (E2E_DEV_SERVER=1)");
  await page.goto("/design");
  const add = page.getByTestId("add-to-plan").first();
  await expect(add.getByRole("button", { name: "Add to Fall 2027" })).toBeVisible();
  await add.getByText("Fall 2026", { exact: true }).click();
  await expect(add.getByRole("button", { name: "Add to Fall 2026" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  // Spring 2027 is not offered: the arrow skips it.
  await expect(add.getByRole("radio", { name: "Fall 2027" })).toBeChecked();
  await add.getByRole("button", { name: "Add to Fall 2027" }).click();
  await expect(add.getByRole("button", { name: "In your plan for Fall 2027" })).toBeVisible();

  if (isMobile(page)) {
    const tabs = page.getByTestId("week-grid").first().locator('[data-layout="tabs"]');
    const tuesday = tabs.getByRole("tab", { name: /Tuesday/ });
    expect((await tuesday.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await tuesday.tap();
    await expect(tabs.getByRole("tabpanel")).toContainText("HIS 357 A");
    await expect(tabs.getByRole("tabpanel")).toContainText("Tentative");
  }
});
