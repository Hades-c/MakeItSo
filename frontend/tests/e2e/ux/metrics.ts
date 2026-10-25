import type { Page } from "@playwright/test";

/**
 * The density and accessibility measures behind the UI-simplification budgets (spec §6, "Metric checks"), moved
 * from the scratchpad scripts into the repo: the in-page density metrics (scripts/metrics.cjs), tap targets and
 * the type floor (targets.cjs), focus hidden behind the fixed bars (obscured.cjs), the h2 order check (axe.cjs)
 * and the target-versus-actual table (verify.cjs). The provenance check (attributed.cjs) is expectAllAttributed in
 * ../helpers.ts. Every function passed to page.evaluate is self-contained: Playwright serialises it into the page.
 */

export interface DensityMetrics {
  height: number;
  words: number;
  textBlocks: number;
  textBlocksAboveFold: number;
  interactive: number;
  interactiveAboveFold: number;
  visibleSourceLabels: number;
  dataSourceItems: number;
  chips: number;
  boxedRegions: number;
  uppercaseTextNodes: number;
  monoTextNodes: number;
  textNodesAt12pxOrLess: number;
  distinctFontSizes: number;
  fontSizes: Record<string, number>;
  sections: number;
  headings: string[];
}

/** Density inside <main>, visible elements only (scripts/metrics.cjs, unchanged rules). */
export function densityMetrics(page: Page, viewportHeight: number): Promise<DensityMetrics> {
  return page.evaluate((vh) => {
    const LABELS = [
      "course schedule",
      "course catalog",
      "ratemyprofessors",
      "wildcatsync",
      "hurt hub",
      "library",
      "the davidsonian",
      "events digest",
      "davidson news",
      "registrar",
      "matthews center",
      "hurt hub programs",
      "davidson offices",
      "handshake",
      "davidson one",
      "your plan",
      "ai",
    ];
    const vis = (e: Element) =>
      e.checkVisibility({ visibilityProperty: true }) &&
      e.getBoundingClientRect().width > 1 &&
      e.getBoundingClientRect().height > 1;
    const main = document.querySelector("main") ?? document.body;
    const inMain = [...main.querySelectorAll("*")].filter(vis);
    const interactive = [
      ...main.querySelectorAll(
        "a[href],button,summary,input:not([type=hidden]),select,textarea,[role=tab],[role=switch]",
      ),
    ].filter(vis);
    const text = (main as HTMLElement).innerText.trim();
    const sizes: Record<string, number> = {};
    let upper = 0;
    let mono = 0;
    let srcLabels = 0;
    let textBlocks = 0;
    let foldText = 0;
    let small12 = 0;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? "").trim();
      const e = n.parentElement;
      if (!t || !e || seen.has(e) || !vis(e)) continue;
      seen.add(e);
      textBlocks++;
      const cs = getComputedStyle(e);
      sizes[cs.fontSize] = (sizes[cs.fontSize] ?? 0) + 1;
      if (parseFloat(cs.fontSize) <= 12.5) small12++;
      if (
        cs.textTransform === "uppercase" ||
        (t.length > 2 && t === t.toUpperCase() && /[A-Z]{3}/.test(t) && !/^[A-Z]{2,4} \d/.test(t))
      )
        upper++;
      if (/mono/i.test(cs.fontFamily)) mono++;
      if (LABELS.includes(t.toLowerCase().replace(/^source:\s*/, ""))) srcLabels++;
      if (e.getBoundingClientRect().top + scrollY < vh) foldText++;
    }
    const chips = inMain.filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.height > 30 || r.height < 12 || r.width > 260) return false;
      const cs = getComputedStyle(e);
      const bordered = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none";
      const parent = e.parentElement ? getComputedStyle(e.parentElement).backgroundColor : "";
      const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== parent;
      return (
        (bordered || filled) &&
        cs.display.includes("inline") &&
        ((e as HTMLElement).innerText ?? "").trim().length > 0 &&
        !e.matches("a[href],button,input,select")
      );
    }).length;
    const boxed = inMain.filter((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return (
        parseFloat(cs.borderTopWidth) > 0 &&
        cs.borderTopStyle !== "none" &&
        parseFloat(cs.borderLeftWidth) > 0 &&
        r.height > 40 &&
        r.width > 120
      );
    }).length;
    const heads = [...main.querySelectorAll("h1,h2,h3")]
      .filter(vis)
      .map(
        (h) => `${h.tagName}: ${(h.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 70)}`,
      );
    return {
      height: document.documentElement.scrollHeight,
      words: text.split(/\s+/).filter(Boolean).length,
      textBlocks,
      textBlocksAboveFold: foldText,
      interactive: interactive.length,
      interactiveAboveFold: interactive.filter((e) => e.getBoundingClientRect().top + scrollY < vh)
        .length,
      visibleSourceLabels: srcLabels,
      dataSourceItems: main.querySelectorAll("[data-source]").length,
      chips,
      boxedRegions: boxed,
      uppercaseTextNodes: upper,
      monoTextNodes: mono,
      textNodesAt12pxOrLess: small12,
      distinctFontSizes: Object.keys(sizes).length,
      fontSizes: sizes,
      sections: heads.filter((h) => h.startsWith("H2")).length,
      headings: heads,
    };
  }, viewportHeight);
}

export interface PageChecks {
  /** scrollWidth − clientWidth: > 0 scrolls sideways. */
  overflow: number;
  /**
   * Red marks in <main> that say something: elements with text drawn in the urgent red or on its fill, counted
   * once (not again for a child that inherits the colour). The now indicator is one (its pill; the dot on its
   * line has no text), and so is each of the student's due-today labels.
   */
  red: number;
  /**
   * Today's Due rows that are not the student's ("Also in the next two weeks", held-back rows included), and how
   * many of them are drawn as urgent (data-urgent, or any urgent red inside): QW1 keeps red for the student.
   */
  dueNotForYou: { rows: number; urgent: number };
  /** Rail labels on screen at 13px or more (720–1179px). */
  railLabelsVisible: number;
  /** Whether the h2s read in the same order in the DOM as on screen (WCAG 1.3.2). */
  h2Order: { same: boolean; dom: string[]; visual: string[] };
  /** The smallest font size of visible text on the page. */
  minFont: number;
}

/** Page-level checks: overflow, red spend, rail labels, h2 order (axe.cjs), the type floor (targets.cjs). */
export function pageChecks(page: Page): Promise<PageChecks> {
  return page.evaluate(() => {
    const vis = (e: Element | null): e is HTMLElement =>
      !!e &&
      e.checkVisibility({ visibilityProperty: true }) &&
      e.getBoundingClientRect().height > 0;
    const main = document.querySelector("main") ?? document.body;
    const probe = (value: string, prop: "color" | "backgroundColor") => {
      const span = document.createElement("span");
      span.style[prop] = value;
      document.body.append(span);
      const out = getComputedStyle(span)[prop];
      span.remove();
      return out;
    };
    const reds = new Set([
      probe("var(--urgent)", "color"),
      probe("var(--urgent-fill)", "backgroundColor"),
    ]);
    const isRed = (e: Element) => {
      const cs = getComputedStyle(e);
      return reds.has(cs.backgroundColor) || reds.has(cs.color);
    };
    const redMarks = [...main.querySelectorAll("*")].filter(
      (e) => vis(e) && !!e.textContent?.trim() && isRed(e),
    );
    const red = redMarks.filter((e) => !redMarks.some((o) => o !== e && o.contains(e))).length;
    // Hidden rows too (behind "Show N more"): computed colours do not need layout.
    const notForYou = [
      ...main.querySelectorAll('[data-testid="due-soon-item"][data-for-you="false"]'),
    ];
    const dueNotForYou = {
      rows: notForYou.length,
      urgent: notForYou.filter(
        (row) => row.hasAttribute("data-urgent") || [row, ...row.querySelectorAll("*")].some(isRed),
      ).length,
    };
    const nav = document.querySelector('nav[aria-label="Main"]');
    const railLabelsVisible = nav
      ? [...nav.querySelectorAll("a span")].filter((s) => {
          const r = s.getBoundingClientRect();
          return (
            vis(s) &&
            !!s.textContent?.trim() &&
            r.width > 8 &&
            r.height > 8 &&
            parseFloat(getComputedStyle(s).fontSize) >= 13
          );
        }).length
      : 0;
    const h2s = [...main.querySelectorAll("h2")].filter(vis);
    const label = (h: Element) => (h.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
    const dom = h2s.map(label);
    const visual = [...h2s]
      .sort((a, b) => {
        const A = a.getBoundingClientRect();
        const B = b.getBoundingClientRect();
        // Row by row: a heading more than half a line lower comes later; on the same row, left first.
        return Math.abs(A.top - B.top) > 8 ? A.top - B.top : A.left - B.left;
      })
      .map(label);
    let minFont = 99;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const e = n.parentElement;
      if (!n.textContent?.trim() || !e || !e.checkVisibility()) continue;
      if (e.getBoundingClientRect().width <= 1) continue;
      minFont = Math.min(minFont, parseFloat(getComputedStyle(e).fontSize));
    }
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      red,
      dueNotForYou,
      railLabelsVisible,
      h2Order: { same: JSON.stringify(dom) === JSON.stringify(visual), dom, visual },
      minFont,
    };
  });
}

/** Where the first visible match of `selector` is, in document pixels (null when there is none). */
export function positionOf(
  page: Page,
  selector: string,
): Promise<{ top: number; bottom: number; height: number } | null> {
  return page.evaluate((sel) => {
    const e = [...document.querySelectorAll(sel)].find(
      (n) => n.checkVisibility() && n.getBoundingClientRect().height > 0,
    );
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return {
      top: Math.round(r.top + scrollY),
      bottom: Math.round(r.bottom + scrollY),
      height: Math.round(r.height),
    };
  }, selector);
}

/**
 * Keyboard focus hidden behind a fixed bar (obscured.cjs, WCAG 2.4.11): Tab through the page and count the
 * focused controls in <main> that sit entirely under a fixed or sticky bar they are not part of.
 */
export async function obscuredFocus(page: Page, presses = 40): Promise<string[]> {
  const hidden: string[] = [];
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body || !el.closest("main")) return null;
      const r = el.getBoundingClientRect();
      if (r.height === 0) return null;
      const bars = [...document.querySelectorAll<HTMLElement>("body *")].filter((e) => {
        const cs = getComputedStyle(e);
        return (
          (cs.position === "fixed" || cs.position === "sticky") &&
          !e.contains(el) &&
          e.getBoundingClientRect().height > 20 &&
          cs.display !== "none"
        );
      });
      const covered = bars.some((bar) => {
        const b = bar.getBoundingClientRect();
        return (
          r.top >= b.top - 1 &&
          r.bottom <= b.bottom + 1 &&
          r.left >= b.left - 1 &&
          r.right <= b.right + 1
        );
      });
      return covered
        ? (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)
        : null;
    });
    if (hit !== null) hidden.push(hit);
  }
  return hidden;
}

// ---- Budgets and the table --------------------------------------------------------------------------------------

export type Op = "<=" | ">=" | "==";

/** One budget: a measure, how it compares and its target. `hard` budgets fail the test; the rest are warnings. */
export interface Budget {
  check: string;
  op: Op;
  target: number;
  hard?: boolean;
}

export interface BudgetResult extends Budget {
  width: number;
  actual: number | null;
  pass: boolean;
  /** A miss that matches its known baseline entry exactly: listed as KNOWN, never a failure. */
  known?: boolean;
  /** Said after the actual value (in the table and in a failure). */
  detail?: string;
}

export function judge(budget: Budget, width: number, actual: number | null): BudgetResult {
  const pass =
    actual !== null &&
    (budget.op === "<="
      ? actual <= budget.target
      : budget.op === ">="
        ? actual >= budget.target
        : actual === budget.target);
  return { ...budget, width, actual, pass };
}

/** The h2 sequences in the DOM and on screen, as pageChecks measures them. */
export interface H2Sequences {
  dom: readonly string[];
  visual: readonly string[];
}

/** A baseline entry: the known sequences, and another screen order for two headings that tie on one row. */
export interface KnownH2Sequences extends H2Sequences {
  alsoVisual?: readonly string[];
}

const sequence = (labels: readonly string[]) => labels.join(" > ");

/**
 * The h2 order check (WCAG 1.3.2), hard on every page at every width: the DOM must read in the order the screen
 * shows, except where `known` (the page's entry in h2-order-baseline.ts) lists today's mismatch exactly. A new
 * mismatch fails, a known one whose sequences change fails, and so does a known one that is fixed, so its entry
 * is removed as the item that fixes it lands.
 */
export function judgeH2Order(
  width: number,
  observed: H2Sequences & { same: boolean },
  known: KnownH2Sequences | undefined,
): BudgetResult {
  const base = { check: "h2Order", op: "==", target: 1, hard: true, width } as const;
  const seen = `DOM ${sequence(observed.dom)} | screen ${sequence(observed.visual)}`;
  if (!known) {
    return observed.same
      ? { ...base, actual: 1, pass: true }
      : { ...base, actual: 0, pass: false, detail: `new mismatch: ${seen}` };
  }
  if (observed.same)
    return { ...base, actual: 1, pass: false, detail: "now in order: remove its baseline entry" };
  const same =
    sequence(known.dom) === sequence(observed.dom) &&
    [known.visual, known.alsoVisual].some((v) => !!v && sequence(v) === sequence(observed.visual));
  return same
    ? { ...base, actual: 0, pass: false, known: true, detail: "known, in the baseline" }
    : { ...base, actual: 0, pass: false, detail: `differs from its baseline: ${seen}` };
}

/** A result's verdict in the table: PASS, KNOWN (a baselined miss), FAIL (hard) or WARN. */
export function verdict(r: BudgetResult): "PASS" | "KNOWN" | "FAIL" | "WARN" {
  return r.pass ? "PASS" : r.known ? "KNOWN" : r.hard ? "FAIL" : "WARN";
}

/** The target-versus-actual table for one page, as Markdown (the CI job summary renders it). */
export function budgetTable(page: string, results: readonly BudgetResult[]): string {
  const rows = results.map(
    (r) =>
      `| ${r.width} | ${r.check} | ${r.op} ${r.target} | ${r.actual ?? "missing"}${
        r.detail ? ` (${r.detail.replaceAll("|", "\\|")})` : ""
      } | ${verdict(r)} |`,
  );
  return [
    `### ${page}`,
    "",
    "| width | check | target | actual | result |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
