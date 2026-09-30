import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { SOURCES, type SourceId } from "../../lib/sources";
import { collectErrors, registerViaApi, signIn, uniqueEmail } from "./helpers";

/**
 * /events (W9b): the synced campus feeds from the fixtures, grouped by America/New_York day with the server's
 * pinned "today" (FIXTURES_NOW = Wed 2026-09-30 12:00 ET), filters in the URL, Show more, library hours and the
 * sources' as-of times. Every aggregated item must carry its source tag (expectAllTagged).
 */

const PASSWORD = "events e2e password";

/**
 * Every aggregated item on the page (data-testid="event-item") names its stored source in data-source and renders
 * that source's tag (SourceTag: data-source + the registry label). contractRequest: move to tests/e2e/helpers.ts.
 */
async function expectAllTagged(page: Page, selector = "[data-testid=event-item]") {
  const items = page.locator(selector);
  expect(await items.count(), "aggregated items on the page").toBeGreaterThan(0);
  const found = await items.evaluateAll((elements) =>
    elements.map((el) => {
      const source = el.getAttribute("data-source");
      const tag = source ? el.querySelector(`span[data-source="${source}"]`) : null;
      return { source, tag: tag?.textContent ?? null };
    }),
  );
  const problems = found.flatMap(({ source, tag }, index) => {
    if (!source || !(source in SOURCES)) return [`item ${index}: no known data-source (${source})`];
    const label = SOURCES[source as SourceId].label;
    return tag === `Source: ${label}` ? [] : [`item ${index}: tag "${tag}" is not "${label}"`];
  });
  expect(problems).toEqual([]);
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

const EVENT_SOURCES = ["wildcatsync", "hurt-hub", "library", "events-digest"];

/** Sign up, sign in, and wait until a read's background sync has stored every events feed of the fixtures. */
async function signedInWithFeeds(page: Page, request: Parameters<typeof registerViaApi>[0]) {
  const email = uniqueEmail("e2e-events");
  await registerViaApi(request, { name: "Evie Events", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
  await expect
    .poll(
      async () => {
        const res = await page.request.get("/api/events");
        const body = (await res.json()) as { sources: { id: string; lastSync: string | null }[] };
        return body.sources.filter((s) => EVENT_SOURCES.includes(s.id) && s.lastSync).length;
      },
      { timeout: 30_000 },
    )
    .toBe(EVENT_SOURCES.length);
}

const items = (page: Page) => page.getByTestId("event-item");

/** A filter chip (a label around a visually hidden radio or checkbox): click the chip, as people do. */
const chip = (page: Page, name: string) =>
  page
    .getByRole("form", { name: "Filter events" })
    .locator("label")
    .filter({ hasText: new RegExp(`^${name}$`) });

test("events: grouped by campus day, every item tagged and linked out, accessibly", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await signedInWithFeeds(page, request);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const response = await page.goto("/events");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
    await expect(page.getByText("Wednesday, September 30").first()).toBeVisible();
    await expect(page.getByTestId("events-summary")).toContainText("Next 14 days:");
    await expect(page.getByTestId("events-summary")).toContainText("through Tuesday, Oct 13.");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 2, name: /^Ongoing/ })).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 2, name: /^Today Wednesday, September 30/ }),
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { level: 2, name: /^Tomorrow Thursday, October 1/ }),
    ).toBeVisible();

    await expectAllTagged(page);
    const links = await items(page)
      .getByRole("link")
      .evaluateAll((els) =>
        els.map((a) => [a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]),
      );
    expect(links.length).toBe(await items(page).count());
    for (const [href, target, rel] of links) {
      expect(href).toMatch(/^https:\/\//);
      expect(target).toBe("_blank");
      expect(rel).toBe("noopener noreferrer");
    }

    // Library hours and sources, from the same fixtures.
    const hours = page.getByRole("region", { name: /Library hours/ });
    await expect(hours.getByText("Music Library (Sloan 101)")).toBeVisible();
    await expect(hours.getByText("Open now").first()).toBeVisible();
    await expect(hours.getByText(/as of Sep 30/)).toBeVisible();
    const sources = page.getByTestId("event-sources").getByRole("listitem");
    await expect(sources).toHaveCount(4);
    await expect(sources.filter({ hasText: "as of Sep 30, 12:00 PM" })).toHaveCount(4);

    expect(await horizontalOverflow(page), "scrolls sideways").toBeLessThanOrEqual(0);
    expect(await seriousViolations(page), `axe ${colorScheme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("events: filters live in the URL, and Show more pages through", async ({ page, request }) => {
  test.setTimeout(90_000);
  await signedInWithFeeds(page, request);
  await page.goto("/events");
  const all = await items(page).count();
  expect(all).toBeGreaterThan(10);

  // Deadlines only.
  await chip(page, "Deadlines").click();
  await expect(page).toHaveURL(/\/events\?kinds=deadline$/);
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toHaveAttribute("data-kind", "deadline");
  await expect(items(page).first()).toContainText("Due 3:00 PM");
  await expect(items(page).first()).toContainText("Watson Fellowship");
  await expect(page.getByRole("checkbox", { name: "Deadlines" })).toBeChecked();

  // Clear, then today only.
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(items(page)).toHaveCount(all);
  await chip(page, "Today").click();
  await expect(page).toHaveURL(/\/events\?range=today$/);
  await expect(page.getByTestId("events-summary")).toContainText("Today:");
  await expect(page.getByRole("radio", { name: "Today" })).toBeChecked();
  await expect(
    page.getByRole("main").getByRole("heading", { level: 2, name: /^Tomorrow/ }),
  ).toHaveCount(0);

  // One source, then words.
  await chip(page, "Library").click();
  await expect(page).toHaveURL(/\/events\?sources=library&range=today$/);
  await expect(items(page).first()).toBeVisible();
  for (const source of await items(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-source")),
  )) {
    expect(source).toBe("library");
  }
  await page.goto("/events");
  const search = page.getByRole("searchbox", { name: "Search events" });
  await search.fill("voter registration");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/events\?q=voter\+registration$/);
  await expect(items(page)).toHaveCount(2);
  await search.fill("underwater basket weaving");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nothing matches these filters" })).toBeVisible();

  // Show more.
  await page.goto("/events?limit=5");
  await expect(items(page)).toHaveCount(5);
  await expect(page.getByTestId("events-summary")).toContainText("At least 5 items");
  await page.getByRole("link", { name: "Show more" }).click();
  await expect(page).toHaveURL(/\/events\?limit=55$/);
  await expect(items(page)).toHaveCount(all);
  await expect(page.getByRole("link", { name: "Show more" })).toHaveCount(0);
});

test("events: the filter form works before JavaScript runs", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const email = uniqueEmail("e2e-events-nojs");
    await registerViaApi(request, { name: "No Script", email, password: PASSWORD });
    // Sign in through the API-backed form in a JS context, then reuse its cookies here.
    const js = await browser.newContext();
    const jsPage = await js.newPage();
    await signIn(jsPage, email, PASSWORD);
    await context.addCookies(await js.cookies());
    await js.close();

    await page.goto("/events");
    await chip(page, "Deadlines").click();
    await chip(page, "This week").click();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/events\?q=&range=week&kinds=deadline$/);
    await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  } finally {
    await context.close();
  }
});
