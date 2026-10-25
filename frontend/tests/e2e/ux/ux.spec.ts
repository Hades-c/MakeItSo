import { appendFileSync } from "node:fs";
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import {
  attributionReport,
  newSignedInAccount,
  SAME_ORIGIN,
  seriousViolations,
  smallTapTargets,
  verifyMailbox,
} from "../helpers";
import { H2_ORDER_BASELINE } from "./h2-order-baseline";
import {
  budgetTable,
  densityMetrics,
  judge,
  judgeH2Order,
  obscuredFocus,
  pageChecks,
  positionOf,
  type Budget,
  type BudgetResult,
} from "./metrics";

/**
 * The UI-simplification budgets (spec §6 "Metric checks", QW0) on the fixture server, for a realistic signed-in
 * student: Avery Lakeside, class of 2028 (a junior), Computer Science with an Economics minor, two years of
 * completed courses, four Fall 2026 classes, a Spring 2027 plan of three repeats with CRNs and three deadlines of
 * her own (the student the spec's evidence and mockups were measured on). Each page is measured at its widths
 * and prints a target-versus-actual table (the console, the test's attachments and, in CI, the job summary).
 *
 * Budget misses are warnings (a test annotation and a WARN row): a budget becomes `hard` (a failure) once the item
 * that meets it has landed. Hard from day one: axe serious or critical findings (light and dark, 1440 and 390),
 * sideways scrolling at 390 and the h2 order (WCAG 1.3.2) on every page at every width, against the mismatches
 * known today (h2-order-baseline.ts, KNOWN rows) that QW8 and later items remove. Hard as their items landed:
 * QW1's red only for the student and QW17's rail labels. The strict provenance check (attributionReport, §5.5)
 * is a warning with its problems listed.
 *
 * Runs once, in the desktop project (it sets its own viewports, a touch phone for 390). `npm run test:ux` runs
 * only this file; `npm run test:e2e` (CI) runs it with the rest.
 */

const PASSWORD = "ux budgets password 42";
const EVENT_SOURCES = ["wildcatsync", "hurt-hub", "library", "events-digest"];

type Width = 1440 | 1024 | 768 | 390;

interface UxPage {
  name: string;
  path: string;
  /** Budgets per width. `pos:<selector>.<top|bottom|height>` measures the first visible match, in page px. */
  budgets: Partial<Record<Width, Budget[]>>;
}

const RAIL: Budget[] = [
  { check: "overflow", op: "==", target: 0 },
  // QW17: the 720–1179px rail names all six destinations in visible 13px labels.
  { check: "railLabelsVisible", op: "==", target: 6, hard: true },
];
const PHONE: Budget[] = [
  { check: "overflow", op: "==", target: 0, hard: true },
  { check: "smallTargets", op: "==", target: 0 },
  { check: "obscured", op: "==", target: 0 },
  { check: "minFont", op: ">=", target: 12 },
];
/**
 * QW1: no Due row that is not the student's is drawn as urgent. The second budget keeps the first from passing on
 * an empty list: Avery (a junior) sees rows for other class years, the seniors' Watson deadline due today among them.
 */
const DUE_RED: Budget[] = [
  { check: "dueNotForYouUrgent", op: "==", target: 0, hard: true },
  { check: "dueNotForYouRows", op: ">=", target: 1, hard: true },
];
/** Visible [data-source] items (and new-tab links, L0 lines) the strict provenance check finds fault with. */
const ATTRIBUTED: Budget = { check: "attribution", op: "==", target: 0 };

/** The spec §11 targets, on the live pages' own selectors. */
const PAGES: UxPage[] = [
  {
    name: "today",
    path: "/today",
    budgets: {
      1440: [
        { check: "height", op: "<=", target: 1400 },
        { check: "words", op: "<=", target: 420 },
        { check: "upper", op: "==", target: 0 },
        { check: "mono", op: "<=", target: 6 },
        { check: "small12", op: "==", target: 0 },
        { check: "sizes", op: "<=", target: 5 },
        { check: "boxed", op: "<=", target: 2 },
        // The now indicator only: Avery has nothing of her own due today.
        { check: "red", op: "==", target: 1 },
        ...DUE_RED,
      ],
      1024: RAIL,
      768: RAIL,
      390: [
        { check: "height", op: "<=", target: 2400 },
        { check: "pos:#due-soon-title.bottom", op: "<=", target: 780 },
        ...DUE_RED,
        ...PHONE,
      ],
    },
  },
  {
    name: "course-csc221",
    path: "/courses/202602/CSC-221",
    budgets: {
      1440: [
        { check: "height", op: "<=", target: 1500 },
        { check: "words", op: "<=", target: 395 },
      ],
      1024: RAIL,
      768: RAIL,
      390: [
        { check: "height", op: "<=", target: 2600 },
        { check: "pos:#sections-title.top", op: "<=", target: 650 },
        ...PHONE,
      ],
    },
  },
  {
    name: "courses",
    path: "/courses",
    budgets: {
      1440: [
        { check: "height", op: "<=", target: 1600 },
        { check: "srcLabels", op: "<=", target: 1 },
      ],
      390: [{ check: "height", op: "<=", target: 3000 }, ...PHONE],
    },
  },
  {
    name: "plan-next",
    path: "/plan?tab=next",
    budgets: {
      1440: [{ check: "height", op: "<=", target: 1000 }],
      390: [{ check: "height", op: "<=", target: 1400 }, ...PHONE],
    },
  },
  {
    name: "events",
    path: "/events",
    budgets: {
      1440: [
        { check: "words", op: "<=", target: 700 },
        { check: "height", op: "<=", target: 2600 },
        { check: "upper", op: "==", target: 0 },
        { check: "mono", op: "==", target: 0 },
      ],
      390: [{ check: "height", op: "<=", target: 3000 }, ...PHONE],
    },
  },
  {
    name: "career-software-engineering",
    path: "/careers/software-engineering",
    budgets: {
      1440: [{ check: "upper", op: "==", target: 0 }],
      390: PHONE,
    },
  },
];

/** Avery's plan: [term, course, status, CRN]. */
const AVERY_PLAN: [string, string, string, string?][] = [
  ["202501", "CSC 121", "completed"],
  ["202501", "MAT 140", "completed"],
  ["202501", "WRI 101", "completed"],
  ["202501", "ECO 101", "completed"],
  ["202502", "CSC 221", "completed"],
  ["202502", "ECO 232", "completed"],
  ["202502", "POL 111", "completed"],
  ["202502", "MAT 150", "completed"],
  ["202601", "CSC 321", "in-progress", "10147"],
  ["202601", "ECO 232", "in-progress", "10181"],
  ["202601", "ENG 260", "in-progress", "10208"],
  ["202601", "ENV 237", "in-progress", "10230"],
  ["202602", "CSC 221", "planned", "20135"],
  ["202602", "ENV 237", "planned", "20226"],
  ["202602", "MAT 140", "planned", "20300"],
  ["202701", "HIS 357", "planned"],
];

const AVERY_DEADLINES = [
  { title: "CSC 321 problem set 3", dueAt: "2026-10-02T23:59:00-04:00", courseCode: "CSC 321" },
  { title: "ENG 260 response paper", dueAt: "2026-10-05T09:00:00-04:00", courseCode: "ENG 260" },
  { title: "Meet advisor about the CS major plan", dueAt: "2026-10-08T14:00:00-04:00" },
];

/** Signs Avery up (verified, consented, onboarded, her plan and deadlines) and returns her session. */
async function seedAvery(browser: Browser): Promise<BrowserContextOptions["storageState"]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = await newSignedInAccount(page, page.request, "e2e-ux-avery", {
    name: "Avery Lakeside",
    password: PASSWORD,
  });
  await verifyMailbox(page, email);
  const api = page.request;
  const profile = await api.patch("/api/profile", {
    data: {
      majors: ["Computer Science"],
      minors: ["Economics"],
      graduationYear: 2028,
      interests: ["software-engineering"],
      onboarded: true,
    },
    headers: SAME_ORIGIN,
  });
  expect(profile.status(), await profile.text()).toBe(200);
  for (const [termCode, courseCode, status, crn] of AVERY_PLAN) {
    const res = await api.post("/api/plan/items", {
      data: { termCode, courseCode, status, ...(crn ? { crn } : {}) },
      headers: SAME_ORIGIN,
    });
    expect(res.status(), `${termCode} ${courseCode}: ${await res.text()}`).toBe(201);
  }
  for (const deadline of AVERY_DEADLINES) {
    const res = await api.post("/api/plan/deadlines", { data: deadline, headers: SAME_ORIGIN });
    expect(res.status(), await res.text()).toBe(201);
  }
  const consent = await api.put("/api/profile/ai-consent", {
    data: { adultAttested: true },
    headers: SAME_ORIGIN,
  });
  expect(consent.status()).toBe(200);
  // The events feeds sync in the background on the first read: wait until all are stored.
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
  const state = await context.storageState();
  await context.close();
  return state;
}

function contextFor(width: Width): BrowserContextOptions {
  return width < 720
    ? { viewport: { width, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width, height: 900 } };
}

async function open(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  // Today's and the course page's panels stream in; measure the settled page.
  await page.waitForLoadState("networkidle");
}

/** Every measure a budget may name, for one page at one width. */
async function measure(page: Page, width: Width, checks: readonly Budget[]) {
  const height = width < 720 ? 844 : 900;
  const m = await densityMetrics(page, height);
  const c = await pageChecks(page);
  const values: Record<string, number | null> = {
    height: m.height,
    words: m.words,
    upper: m.uppercaseTextNodes,
    mono: m.monoTextNodes,
    small12: m.textNodesAt12pxOrLess,
    sizes: m.distinctFontSizes,
    boxed: m.boxedRegions,
    chips: m.chips,
    srcLabels: m.visibleSourceLabels,
    interactive: m.interactive,
    red: c.red,
    dueNotForYouUrgent: c.dueNotForYou.urgent,
    dueNotForYouRows: c.dueNotForYou.rows,
    overflow: c.overflow,
    railLabelsVisible: c.railLabelsVisible,
    minFont: c.minFont,
  };
  const notes: string[] = [];
  if (!c.h2Order.same) {
    notes.push(
      `h2 order @${width}: DOM ${c.h2Order.dom.join(" > ")} | screen ${c.h2Order.visual.join(" > ")}`,
    );
  }
  for (const { check } of checks) {
    if (check === "smallTargets") {
      const small = await smallTapTargets(page);
      values.smallTargets = small.length;
      if (small.length) notes.push(`small targets @${width}: ${small.slice(0, 6).join("; ")}`);
    } else if (check === "obscured") {
      const hidden = await obscuredFocus(page);
      values.obscured = hidden.length;
      if (hidden.length) notes.push(`focus hidden @${width}: ${hidden.join("; ")}`);
    } else if (check.startsWith("pos:")) {
      const spec = check.slice(4);
      const dot = spec.lastIndexOf(".");
      const at = await positionOf(page, spec.slice(0, dot));
      const edge = spec.slice(dot + 1) as "top" | "bottom" | "height";
      values[check] = at ? at[edge] : null;
    }
  }
  return { values, notes, h2Order: c.h2Order };
}

test.describe("UI budgets", () => {
  let avery: BrowserContextOptions["storageState"];

  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.name !== "desktop") return;
    testInfo.setTimeout(120_000);
    avery = await seedAvery(browser);
  });

  for (const target of PAGES) {
    test(`${target.name}: target versus actual, axe and provenance`, async ({
      browser,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "runs once: it sets its own viewports");
      test.setTimeout(180_000);
      const results: BudgetResult[] = [];
      const notes: string[] = [];
      const widths = (Object.keys(target.budgets).map(Number) as Width[]).sort((a, b) => b - a);

      for (const width of widths) {
        const checks = target.budgets[width] ?? [];
        const context = await browser.newContext({
          ...contextFor(width),
          storageState: avery,
          colorScheme: "light",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        try {
          await open(page, target.path);
          const measured = await measure(page, width, checks);
          notes.push(...measured.notes);
          for (const budget of checks)
            results.push(judge(budget, width, measured.values[budget.check] ?? null));
          results.push(
            judgeH2Order(width, measured.h2Order, H2_ORDER_BASELINE[`${target.name}@${width}`]),
          );

          if (width === 1440 || width === 390) {
            // The strict provenance check (a warning until M1), then axe in both themes (hard).
            await open(page, target.path);
            const attribution = await attributionReport(page);
            results.push(judge(ATTRIBUTED, width, attribution.problems.length));
            for (const problem of attribution.problems.slice(0, 8))
              notes.push(`provenance @${width}: ${problem}`);
            expect(await seriousViolations(page), `${target.name} @${width} light: axe`).toEqual(
              [],
            );
            await page.emulateMedia({ colorScheme: "dark" });
            expect(await seriousViolations(page), `${target.name} @${width} dark: axe`).toEqual([]);
          }
        } finally {
          await context.close();
        }
      }

      const table = [budgetTable(target.name, results), ...notes.map((n) => `- ${n}`), ""].join(
        "\n",
      );
      console.log(table);
      await testInfo.attach(`${target.name}-budgets.md`, {
        body: table,
        contentType: "text/markdown",
      });
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
      for (const miss of results.filter((r) => !r.pass && (r.known || !r.hard))) {
        testInfo.annotations.push({
          type: "warning",
          description: `${target.name} @${miss.width}: ${miss.check} is ${miss.actual ?? "missing"}, target ${miss.op} ${miss.target}${miss.detail ? ` (${miss.detail})` : ""}`,
        });
      }
      const failed = results.filter((r) => !r.pass && r.hard && !r.known);
      expect(
        failed.map(
          (r) =>
            `${r.check} @${r.width}: ${r.actual ?? "missing"} (target ${r.op} ${r.target})${
              r.detail ? `: ${r.detail}` : ""
            }`,
        ),
        `${target.name}: hard budgets`,
      ).toEqual([]);
    });
  }

  test("the h2 order baseline names only measured pages and widths", ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once");
    const measured = new Set(
      PAGES.flatMap((p) => Object.keys(p.budgets).map((width) => `${p.name}@${width}`)),
    );
    expect(Object.keys(H2_ORDER_BASELINE).filter((key) => !measured.has(key))).toEqual([]);
  });

  test("the red measures count a mark once and catch a red row that is not the student's", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once");
    // Today's shapes: the now pill and its line's dot, a due-today label of the student's (its time inherits the
    // red), and a row for another class year, first plain, then (the bug QW1 fixed) red behind "Show N more".
    const row = (forYou: boolean, labelClass: string, hidden = false) =>
      `<div${hidden ? " hidden" : ""}><ol><li data-testid="due-soon-item" data-for-you="${forYou}">` +
      `<p>Watson Fellowship</p><p class="${labelClass}">Today <span>9:00a</span></p></li></ol></div>`;
    const html = (other: string) =>
      `<style>:root{--urgent:rgb(194, 29, 29);--urgent-fill:rgb(176, 24, 24)}` +
      `.text-urgent{color:var(--urgent)}.bg-urgent{background:var(--urgent)}` +
      `.bg-urgent-fill{background:var(--urgent-fill);color:rgb(255, 255, 255)}.dot{display:block;width:10px;height:10px}</style>` +
      `<main><span class="bg-urgent-fill">12:00p</span><div><span class="dot bg-urgent"></span></div>` +
      `${row(true, "text-urgent")}${other}</main>`;
    await page.setContent(html(row(false, "plain")));
    expect(await pageChecks(page)).toMatchObject({ red: 2, dueNotForYou: { rows: 1, urgent: 0 } });
    await page.setContent(html(row(false, "text-urgent", true)));
    expect(await pageChecks(page)).toMatchObject({ red: 2, dueNotForYou: { rows: 1, urgent: 1 } });
  });
});
