import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, registerViaApi, signIn, uniqueEmail } from "./helpers";

/** Every hub route (stubs until waves 1-3 fill them in). */
const HUB_ROUTES = [
  "/today",
  "/courses",
  "/courses/202602/CSC-221",
  "/plan",
  "/careers",
  "/careers/software-engineering",
  "/events",
  "/alumni",
  "/profile",
] as const;

const PUBLIC_ROUTES = ["/", "/login", "/register"] as const;

const PASSWORD = "shell e2e password";

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

function isMobile(page: Page) {
  return (page.viewportSize()?.width ?? 1440) < 720;
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`every hub route renders the shell, accessibly (${colorScheme})`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail(`e2e-shell-${colorScheme}`);
    await registerViaApi(request, { name: "Riley Shell", email, password: PASSWORD });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const errors = collectErrors(page);
    await signIn(page, email, PASSWORD);

    for (const route of HUB_ROUTES) {
      await test.step(route, async () => {
        const response = await page.goto(route);
        expect(response?.status(), route).toBe(200);

        // Shell: top bar, one visible main navigation, the page title, and the right layout for the width.
        await expect(page.getByRole("banner")).toBeVisible();
        await expect(
          page.getByRole("banner").getByRole("link", { name: /MakeItSo/ }),
        ).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByTestId("bottom-tabs")).toBeVisible({ visible: isMobile(page) });
        if (!isMobile(page)) {
          await expect(page.getByRole("search")).toBeVisible();
          await expect(page.getByRole("region", { name: "Sources" })).toBeVisible();
        }
        const theme = await page.evaluate(
          () => getComputedStyle(document.documentElement).colorScheme,
        );
        expect(theme).toBe(colorScheme);

        expect(await horizontalOverflow(page), `${route} scrolls sideways`).toBeLessThanOrEqual(0);
        expect(await seriousViolations(page), `${route} axe`).toEqual([]);
      });
    }

    expect(errors).toEqual([]);
  });
}

test("public pages have no serious accessibility problems in either theme", async ({ page }) => {
  const errors = collectErrors(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await horizontalOverflow(page), `${route} scrolls sideways`).toBeLessThanOrEqual(0);
      expect(await seriousViolations(page), `${route} ${colorScheme} axe`).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});

test("bottom tabs are the only fixed bar on phones and every tab is tappable", async ({
  page,
  request,
}) => {
  test.skip(!isMobile(page), "phones only");
  const email = uniqueEmail("e2e-tabs");
  await registerViaApi(request, { name: "Tab Tester", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);

  const tabs = page.getByTestId("bottom-tabs");
  const box = await tabs.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(Math.round(box!.y + box!.height)).toBe(viewport.height);

  // Nothing else is fixed to the bottom of the screen.
  const otherFixedBottom = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.position !== "fixed" || s.display === "none" || s.visibility === "hidden")
          return false;
        const r = el.getBoundingClientRect();
        return (
          r.height > 0 &&
          r.bottom >= window.innerHeight - 1 &&
          !el.closest("[data-testid=bottom-tabs]")
        );
      })
      .map((el) => el.outerHTML.slice(0, 80)),
  );
  expect(otherFixedBottom).toEqual([]);

  const expected = [
    ["Today", /\/today$/],
    ["Courses", /\/courses$/],
    ["Plan", /\/plan$/],
    ["Careers", /\/careers$/],
    ["Events", /\/events$/],
  ] as const;
  for (const [name, url] of expected) {
    const tab = tabs.getByRole("link", { name });
    const b = (await tab.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    // The element at the tab's centre is the tab itself: nothing overlaps it.
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x!, y!)?.closest("a")?.textContent ?? null,
      [b.x + b.width / 2, b.y + b.height / 2],
    );
    expect(hit).toBe(name);
    await tab.tap();
    await expect(page).toHaveURL(url);
    await expect(tabs.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  }
});

test("theme choice persists across reloads and can return to the system setting", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("e2e-theme");
  await registerViaApi(request, { name: "Theme Tester", email, password: PASSWORD });
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, email, PASSWORD);
  const html = page.locator("html");

  await page.getByRole("button", { name: "Dark mode" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark mode" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitemradio", { name: "Match system" }).click();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
  await page.reload();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
});

test("⌘K / Ctrl+K opens the command palette; Enter with nothing selected searches the catalog", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("e2e-search");
  await registerViaApi(request, { name: "Search Tester", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search MakeItSo" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox", { name: "Search MakeItSo" });
  await expect(input).toBeFocused();
  // /api/search answers from every provider (courses come from the catalog, W1); with no matches the palette says
  // so and keeps the catalog fallback. "organic chemistry" would match CHE courses, so use words no course has.
  await input.fill("underwater basket weaving");
  await expect(dialog.getByText("No matches for “underwater basket weaving”.")).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: /Search courses for “underwater basket weaving”/ }),
  ).toBeVisible();
  await input.press("Enter");
  await expect(page).toHaveURL(/\/courses\?q=underwater\+basket\+weaving$/);
  await expect(page.getByRole("heading", { name: /underwater basket weaving/ })).toBeVisible();
  await expect(dialog).toBeHidden();

  // Pages are always one keystroke away, and Escape closes the palette.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("plan");
  await page.keyboard.press("ArrowDown");
  await expect(dialog.getByRole("option", { name: /My plan/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("the top-bar course search still submits to the catalog", async ({ page, request }) => {
  test.skip(isMobile(page), "the search field is in the desktop top bar");
  const email = uniqueEmail("e2e-search-form");
  await registerViaApi(request, { name: "Form Tester", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);

  const search = page.getByRole("searchbox", { name: "Search courses" });
  await search.fill("organic chemistry");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/courses\?q=organic\+chemistry$/);
});

test("closing the command palette returns focus to what opened it", async ({ page, request }) => {
  test.skip(isMobile(page), "the search field and ⌘K button are in the desktop top bar");
  const email = uniqueEmail("e2e-search-focus");
  await registerViaApi(request, { name: "Focus Searcher", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
  const dialog = page.getByRole("dialog", { name: "Search MakeItSo" });

  // ⌘K from the course field: back to the field.
  const field = page.getByRole("searchbox", { name: "Search courses" });
  await field.focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(field).toBeFocused();

  // The ⌘K button: back to the button, and Tab carries on from there (not from the top of the page).
  const everything = page.getByRole("button", { name: "Search everything" });
  await everything.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close search" }).click();
  await expect(dialog).toBeHidden();
  await expect(everything).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Dark mode" })).toBeFocused();
});

test("the phone search link opens the command palette", async ({ page, request }) => {
  test.skip(!isMobile(page), "phones only");
  const email = uniqueEmail("e2e-search-phone");
  await registerViaApi(request, { name: "Phone Searcher", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);

  // A link to the catalog, so it works before hydration and without JavaScript.
  const trigger = page.getByRole("banner").getByRole("link", { name: "Search", exact: true });
  await expect(trigger).toHaveAttribute("href", "/courses");
  const box = (await trigger.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await trigger.tap();
  await expect(page.getByRole("dialog", { name: "Search MakeItSo" })).toBeVisible();
  await expect(page).toHaveURL(/\/today$/);
  await page.getByRole("button", { name: "Close search" }).tap();
  await expect(page.getByRole("dialog", { name: "Search MakeItSo" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("unknown pages and malformed course codes show a not-found page", async ({
  page,
  request,
}) => {
  const res = await page.goto("/definitely-not-a-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");

  const email = uniqueEmail("e2e-404");
  await registerViaApi(request, { name: "Lost Student", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
  // Inside the hub the not-found page keeps the shell, and still answers with a real 404.
  const hubResponse = await page.goto("/courses/209903/not-a-code");
  expect(hubResponse?.status()).toBe(404);
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  expect((await page.goto("/careers/Not_A_Career"))?.status()).toBe(404);
});

test("keyboard focus shows a Lake Blue ring straight away, never red", async ({
  page,
  request,
}) => {
  test.skip(isMobile(page), "keyboard navigation is checked on desktop");
  const email = uniqueEmail("e2e-focus");
  await registerViaApi(request, { name: "Focus Tester", email, password: PASSWORD });
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, email, PASSWORD);

  const focusToken = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--focus)";
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  // Skip link first, then the wordmark, search, theme toggle, account menu and the sidebar links.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    // Read the ring immediately: it must not fade in from the text colour.
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor };
    });
    expect(ring).toEqual({ style: "solid", width: "2px", color: focusToken });
  }
});
