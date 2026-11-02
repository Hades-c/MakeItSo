import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  collectErrors,
  expectAllAttributed,
  horizontalOverflow,
  isMobile,
  registerViaApi,
  SAME_ORIGIN,
  seriousViolations,
  signIn,
  smallTapTargets,
  uniqueEmail,
} from "./helpers";

/**
 * /today (W7) against the production build in fixtures mode: server "now" is Wed 2026-09-30 12:00 ET (current
 * Fall 2026, registration Spring 2027, WebTree opens Oct 12). A first-year with three Fall 2026 sections (CSC 221 A
 * MWF 10:30, ECO 232 A MWF 11:30, ENV 237 A MW 14:30) and one deadline sees the fixed headline, the timeline with
 * the now-line, the five-day strip, Due for you (All/Classes), this week on campus, opportunities and quick links.
 * Runs at desktop 1440 and phone 390, light and dark, with axe.
 */

const PASSWORD = "today e2e password 42";
const EVENT_SOURCES = ["wildcatsync", "hurt-hub", "library", "events-digest"];

function strip(page: Page) {
  return page.getByRole("navigation", { name: "This school week" });
}

async function newStudent(
  page: Page,
  request: APIRequestContext,
  prefix: string,
  { onboarded = true } = {},
) {
  const email = uniqueEmail(prefix);
  await registerViaApi(request, { name: "Taylor Today", email, password: PASSWORD }, { onboarded });
  await signIn(page, email, PASSWORD, { onboarded });
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

test("today: the headline, timeline, strip and panels for a student with sections", async ({
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
    await expect(h1).toHaveText("Your day at Davidson");
    const main = page.getByRole("main");
    await expect(main.getByText("Wednesday, September 30", { exact: true })).toBeVisible();
    const dueCard = page.getByRole("region", { name: "Due for you 2" });
    // All/Classes pre-renders both views; only the active tab's subtree is in the accessibility tree.
    const allPanel = dueCard.getByRole("tabpanel");
    // One count for what's due: the student's problem set and the WebTree window (all students), never the
    // other class years' or conditional rows. The card's count and its first list agree.
    await expect(allPanel.getByTestId("due-for-you").getByTestId("due-soon-item")).toHaveCount(2);

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

    // Due for you lists the WebTree window itself; the action row has nothing to say about it.
    const due = allPanel.getByTestId("due-soon-item");
    expect(await due.count()).toBeGreaterThan(2);
    // Red only for the student's own rows: the seniors' Watson nomination due today is not.
    await expect(
      allPanel.locator('[data-testid="due-soon-item"][data-for-you="false"] .text-urgent'),
    ).toHaveCount(0);
    // Every row is one press away: "Show N more" reveals the rest in place.
    const showMore = dueCard.getByTestId("show-more");
    await expect(showMore).toHaveAccessibleName(/^Show \d+ more in the next two weeks$/);
    await expect(showMore).toHaveAttribute("aria-expanded", "false");
    const total = await due.count();
    await expect(due.filter({ visible: true })).not.toHaveCount(total);
    await showMore.click();
    await expect(showMore).toHaveAttribute("aria-expanded", "true");
    await expect(showMore).toHaveAccessibleName(/^Show fewer/);
    await expect(due.filter({ visible: true })).toHaveCount(total);
    await expect(due.filter({ hasText: "Problem set" })).toContainText("Tomorrow 11:59p");
    const webtree = due.filter({ hasText: "WebTree Open" });
    await expect(webtree).toContainText("Oct 12 – Nov 3");
    await expect(webtree).toHaveAttribute("data-kind", "registration");
    // Quiet provenance in the meta line: the Registrar's row says it, the student's own deadline does not.
    await expect(webtree).toHaveAttribute("data-source", "registrar");
    await expect(webtree).toContainText("via Registrar");
    const own = allPanel.locator('[data-testid="due-soon-item"][data-kind="student"]');
    await expect(own).toHaveAttribute("data-source", "my-plan");
    await expect(own.getByText("Source: your plan")).toHaveClass(/sr-only/);
    // The header's one line counts the same rows as the card ("All").
    await expect(page.getByTestId("due-for-you-line")).toHaveText(
      "2 due for you in the next two weeks",
    );
    await expect(page.getByTestId("due-for-you-line")).toHaveAttribute("href", "#due-soon");
    // Coursework: the student's course deadline only, with a line saying where the college's are.
    await dueCard.getByRole("tab", { name: /^Coursework/ }).click();
    await expect(dueCard.getByTestId("due-coursework-note")).toBeVisible();
    await expect(
      dueCard.getByRole("tabpanel").getByTestId("due-for-you").getByTestId("due-soon-item"),
    ).toHaveCount(1);
    await dueCard.getByRole("tab", { name: /^Coursework/ }).press("ArrowLeft");
    await expect(dueCard.getByRole("tab", { name: /^All/ })).toBeFocused();
    await expect(dueCard.getByRole("tab", { name: /^All/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await page.getByTestId("campus-item").count()).toBeGreaterThan(0);
    expect(await page.getByTestId("opportunity-item").count()).toBeGreaterThan(1);
    await expect(page.getByTestId("panel-error")).toHaveCount(0);
    await expect(page.getByTestId("onboarding-nudge")).toHaveCount(0);

    // Titles keep a readable width: no letter-by-letter wrapping beside a date or a tag.
    const narrow = await page.evaluate(() => {
      const out: string[] = [];
      for (const a of document.querySelectorAll<HTMLElement>(
        '[data-testid="opportunity-item"] a',
      )) {
        if (a.getBoundingClientRect().width < 120) out.push(`opportunity: ${a.textContent}`);
      }
      for (const name of document.querySelectorAll<HTMLElement>(
        "section[aria-labelledby='quick-links-title'] a > span.flex-col > span:first-child",
      )) {
        const line = parseFloat(getComputedStyle(name).lineHeight) || 20;
        if (name.getBoundingClientRect().height > line * 2.5)
          out.push(`quick link: ${name.textContent}`);
      }
      return out;
    });
    expect(narrow, "squeezed titles").toEqual([]);
    await expect(
      page.locator("section[aria-labelledby='quick-links-title'] a > span.flex-col"),
    ).toHaveCount(9);
    if (isMobile(page)) {
      // Phone order (Lakeside home-390): Today, Due for you, then This week on campus.
      const top = async (name: RegExp) =>
        (await page.getByRole("region", { name }).first().boundingBox())?.y ?? 0;
      const [timelineTop, dueTop, campusTop] = [
        await top(/^Today/),
        await top(/^Due for you/),
        await top(/^This week on campus/),
      ];
      expect(timelineTop).toBeLessThan(dueTop);
      expect(dueTop).toBeLessThan(campusTop);
    }

    // Every aggregated item says where it came from: in its meta line, once per run, or by its list's line.
    const attribution = await expectAllAttributed(page);
    expect(attribution.items).toBeGreaterThan(8);
    await expect(page.getByTestId("timeline-sources")).toContainText("the course schedule");

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
  // Next up is said from the real today (Wednesday): Friday is not "Tomorrow".
  await expect(thursday.getByText(/^Fri 10:30 AM$/)).toBeVisible();
  await expect(thursday.getByText(/^Tomorrow/)).toHaveCount(0);
  // The headline is fixed: viewing another strip day never changes it.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your day at Davidson");
  await thursday.getByRole("link", { name: "Back to today" }).click();
  await expect(page).toHaveURL(/\/today$/);

  expect(errors).toEqual([]);
});

/**
 * The desktop layout's balance, measured on the page: the sections' own content (the last line inside each card,
 * not the stretched card) on the left and on the right half of the page, the scroll positions where one half of the
 * viewport shows no section, and the h2s in DOM order against their order on screen (row by row, left first).
 */
const CARDS = /^(Today|Due for you|This week on campus|Opportunities|Quick links)/;

async function layoutBalance(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const box = main.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    const y0 = window.scrollY;
    const sections = [...main.querySelectorAll<HTMLElement>("section[aria-labelledby]")]
      .filter((s) => s.checkVisibility())
      .map((s) => {
        const r = s.getBoundingClientRect();
        const content = Math.max(...[...s.children].map((c) => c.getBoundingClientRect().bottom));
        const side =
          r.width > box.width * 0.75 ? "full" : r.left + r.width / 2 < mid ? "left" : "right";
        return { top: r.top + y0, bottom: content + y0, side };
      });
    const pageHeight = document.documentElement.scrollHeight;
    const firstFull = Math.min(
      pageHeight,
      ...sections.filter((s) => s.side === "full").map((s) => s.top),
    );
    const end = (side: string) =>
      Math.max(
        0,
        ...sections.filter((s) => s.side === side && s.top < firstFull).map((s) => s.bottom),
      );
    const lopsided: number[] = [];
    for (let y = 0; y + window.innerHeight <= pageHeight; y += 50) {
      const shows = (side: string) =>
        sections.some(
          (s) =>
            (s.side === side || s.side === "full") &&
            s.bottom > y + 60 &&
            s.top < y + window.innerHeight - 60,
        );
      if (!shows("left") || !shows("right")) lopsided.push(y);
    }
    const h2s = [...main.querySelectorAll("h2")].filter((h) => h.checkVisibility());
    const name = (h: Element) => (h.textContent ?? "").trim().replace(/\s+/g, " ");
    const visual = [...h2s].sort((a, b) => {
      const A = a.getBoundingClientRect();
      const B = b.getBoundingClientRect();
      return Math.abs(A.top - B.top) > 8 ? A.top - B.top : A.left - B.left;
    });
    // Row 1's cards end with their own content (they are not stretched to the row): the space between a card's
    // deepest visible content and its bottom edge, for Today and Due for you.
    const tails: Record<string, number> = {};
    for (const s of main.querySelectorAll<HTMLElement>("section[aria-labelledby]")) {
      const title = (
        document.getElementById(s.getAttribute("aria-labelledby")!)?.textContent ?? ""
      ).trim();
      const key = /^Today/.test(title)
        ? "Today"
        : /^Due for you/.test(title)
          ? "Due for you"
          : null;
      if (!key || !s.checkVisibility()) continue;
      let deepest = s.getBoundingClientRect().top;
      for (const el of s.querySelectorAll<HTMLElement>("*")) {
        if (!el.checkVisibility()) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) deepest = Math.max(deepest, r.bottom);
      }
      tails[key] = Math.round(s.getBoundingClientRect().bottom - deepest);
    }
    return {
      tails,
      gap: Math.abs(end("left") - end("right")) / pageHeight,
      lopsided,
      dom: h2s.map(name),
      visual: visual.map(name),
    };
  });
}

for (const student of ["seeded", "new"] as const) {
  test(`today: the desktop reads balanced, in the order of the page (${student} student)`, async ({
    page,
    request,
  }) => {
    test.skip(isMobile(page), "the phone is one column in the same order (checked above)");
    test.setTimeout(120_000);
    // The seeded student has sections and a deadline; the new one (onboarded, nothing added) has a short
    // timeline beside a full Due for you, which is where a stretched Today card ended mostly empty.
    const api = await newStudent(page, request, `e2e-today-balance-${student}`);
    if (student === "seeded") await seedMockupStudent(api);
    await feedsStored(api);
    for (const width of [1440, 1280, 1180, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/today");
      await page.waitForLoadState("networkidle");
      const at = await layoutBalance(page);
      // Rows of cards (timeline and Due for you, then campus and opportunities, then quick links): both halves
      // end close together and carry content at every scroll position.
      expect(at.gap, `@${width}: left and right end apart`).toBeLessThanOrEqual(0.15);
      expect(at.lopsided, `@${width}: scroll positions with one half empty`).toEqual([]);
      // Row 1's cards end with their content: at most the card's own bottom padding below it.
      for (const [card, tail] of Object.entries(at.tails)) {
        expect(tail, `@${width}: empty space at the bottom of ${card}`).toBeLessThanOrEqual(40);
      }
      expect(Object.keys(at.tails).sort()).toEqual(["Due for you", "Today"]);
      // WCAG 1.3.2: the DOM reads the sections in the order the screen shows them, the phone's order.
      expect(at.visual, `@${width}: h2 order`).toEqual(at.dom);
      // The cards in phone order (the page may also carry the verify-email banner's h2 above them).
      expect(at.dom.filter((h) => CARDS.test(h)).map((h) => CARDS.exec(h)?.[0])).toEqual([
        "Today",
        "Due for you",
        "This week on campus",
        "Opportunities",
        "Quick links",
      ]);
    }
  });
}

test("today: a new student is asked to finish setting up", async ({ page, request }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  // Not onboarded: Today stays open to it (the hub sends only other pages to /onboarding).
  await newStudent(page, request, "e2e-today-new", { onboarded: false });

  const response = await page.goto("/today");
  expect(response?.status()).toBe(200);
  // The headline is fixed regardless of setup state; the nudge is what asks to finish setting up.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your day at Davidson");
  const nudge = page.getByTestId("onboarding-nudge");
  await expect(nudge.getByRole("link", { name: "Set up my plan" })).toHaveAttribute(
    "href",
    "/onboarding",
  );
  await expect(page.getByTestId("timeline-empty")).toContainText(
    "No Fall 2026 class sections in your plan yet.",
  );
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
  if (isMobile(page)) expect(await smallTapTargets(page), "tap targets under 44px").toEqual([]);
  expect(errors).toEqual([]);
});

test("today: signed out goes to sign in (Today is the default landing page)", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login$/);
});
