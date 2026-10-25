import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { SOURCES, type SourceId } from "../../lib/sources";
import { E2E_UNTAGGED_EXEMPTIONS } from "./untagged";

/**
 * Shared helpers for the Playwright specs: accounts, sign-in and mailbox codes, plus the checks PLAN §6.2/§7 asks
 * of every page (axe, source tags and the strict provenance check, tap targets, sideways overflow). Not a test
 * file itself (Playwright only runs *.spec.ts files).
 */

/** The app origin (playwright.config.ts serves on E2E_PORT). */
export const E2E_ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 3210}`;

/**
 * Headers for direct API calls from tests: state-changing routes require the app's Origin (CSRF protection,
 * server/http/origin.ts), which browsers add by themselves but Playwright's request context does not.
 */
export const SAME_ORIGIN = { origin: E2E_ORIGIN } as const;

/** The password newSignedInAccount, newVerifiedAccount and aiStudent use unless told otherwise. */
export const PASSWORD = "w9a e2e password 42";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@davidson.edu`;
}

/** The form's error message (Next.js also renders an empty role="alert" route announcer). */
export function formError(page: Page) {
  return page.getByRole("alert").filter({ hasText: /\S/ });
}

// ---- Accounts ----------------------------------------------------------------------------------------------------

/**
 * Whether a helper leaves the account onboarded. The hub sends accounts that have not finished first-run setup to
 * /onboarding (app/(hub)/layout.tsx; Today and Profile stay open), so by default the helpers finish it for them
 * (PATCH /api/profile { onboarded: true }, what "Skip setup" does). Specs about the first run pass
 * `{ onboarded: false }`.
 */
export interface OnboardedOption {
  onboarded?: boolean;
}

/**
 * Sign in through the NextAuth credentials endpoint in a throwaway request context (so neither the spec's
 * `request` nor its `page` gets this session) and mark the account onboarded.
 */
async function markOnboarded(email: string, password: string): Promise<void> {
  const api = await playwrightRequest.newContext({ baseURL: E2E_ORIGIN });
  try {
    const csrf = await api.get("/api/auth/csrf");
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    await api.post("/api/auth/callback/credentials", {
      form: { csrfToken, email, password, json: "true" },
      maxRedirects: 0,
    });
    const res = await api.patch("/api/profile", {
      data: { onboarded: true },
      headers: SAME_ORIGIN,
    });
    expect(res.status(), `mark ${email} onboarded`).toBe(200);
  } finally {
    await api.dispose();
  }
}

/** Register a new account through the API: unverified, and onboarded unless `{ onboarded: false }`. */
export async function registerViaApi(
  request: APIRequestContext,
  { name, email, password }: { name: string; email: string; password: string },
  { onboarded = true }: OnboardedOption = {},
) {
  const res = await request.post("/api/auth/register", {
    data: { name, email, password },
    headers: SAME_ORIGIN,
  });
  // Always 202 "check your inbox" (W3: no account enumeration); a new address gets an unverified account.
  expect(res.status()).toBe(202);
  if (onboarded) await markOnboarded(email, password);
}

/**
 * Sign in through the login form, which lands on /today. Also marks the account onboarded unless
 * `{ onboarded: false }`: accounts written straight to the database (legacy ones) need it here; for the others it
 * changes nothing (the first onboardedAt is kept).
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
  { onboarded = true }: OnboardedOption = {},
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  if (onboarded) {
    const res = await page.request.patch("/api/profile", {
      data: { onboarded: true },
      headers: SAME_ORIGIN,
    });
    expect(res.status(), `mark ${email} onboarded`).toBe(200);
  }
}

/** A new @davidson.edu account, signed in (unverified: the e2e server's console mailer holds its code). */
export async function newSignedInAccount(
  page: Page,
  request: APIRequestContext,
  prefix: string,
  { name = "Wren Careers", password = PASSWORD }: { name?: string; password?: string } = {},
): Promise<string> {
  const email = uniqueEmail(prefix);
  await registerViaApi(request, { name, email, password });
  await signIn(page, email, password);
  return email;
}

/** The newest verify-email code sent to `email` (the console mailer, through GET /api/auth/test-mailbox). */
async function verifyCode(request: APIRequestContext, email: string): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(async () => {
      const res = await request.get(`/api/auth/test-mailbox?email=${encodeURIComponent(email)}`);
      const { messages } = (await res.json()) as {
        messages: { kind: string; code: string | null }[];
      };
      code = [...messages].reverse().find((m) => m.kind === "verify-email")?.code ?? null;
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code as unknown as string;
}

/** Verify the signed-in account's mailbox with the e-mailed code (the W3 /verify flow). */
export async function verifyMailbox(page: Page, email: string): Promise<void> {
  const code = await verifyCode(page.request, email);
  await page.goto("/verify");
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
}

/** A verified @davidson.edu account, signed in. */
export async function newVerifiedAccount(
  page: Page,
  request: APIRequestContext,
  prefix: string,
): Promise<string> {
  const email = await newSignedInAccount(page, request, prefix);
  await verifyMailbox(page, email);
  return email;
}

/**
 * A new account for the AI panels, signed in through `page`: verified, and with AI consent (18+ attested), when
 * asked for.
 */
export async function aiStudent(
  page: Page,
  prefix: string,
  name: string,
  {
    verified,
    consent,
    password = PASSWORD,
  }: { verified: boolean; consent: boolean; password?: string },
): Promise<string> {
  const email = await newSignedInAccount(page, page.request, prefix, { name, password });
  if (verified) await verifyMailbox(page, email);
  if (consent) {
    const res = await page.request.put("/api/profile/ai-consent", {
      data: { adultAttested: true },
      headers: SAME_ORIGIN,
    });
    expect(res.status()).toBe(200);
  }
  return email;
}

// ---- Page checks -------------------------------------------------------------------------------------------------

/** Collects console errors and uncaught page errors for the page's lifetime. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/**
 * axe violations of serious or critical impact (WCAG 2.2 AA tags), as readable lines. `include` limits the scan
 * to one part of the page (a CSS selector).
 */
export async function seriousViolations(page: Page, include?: string): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/**
 * Controls whose aria-label leaves out their visible words (WCAG 2.5.3 Label in Name: a speech-input user says
 * what they see). axe's rule for it is experimental, so seriousViolations' tag sets never run it: a spec calls
 * this on the part of the page it owns (`include`, a CSS selector).
 */
export async function labelInNameMismatches(page: Page, include: string): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .include(include)
    .withRules(["label-content-name-mismatch"])
    .analyze();
  return results.violations.flatMap((v) => v.nodes.map((n) => n.target.join(" ")));
}

/** How far the page scrolls sideways (PLAN §6.2: scrollWidth ≤ innerWidth on every route); ≤ 0 passes. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** The phone project, or any viewport under the 720px breakpoint. */
export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 720;
}

/**
 * Every aggregated item on the page carries its source tag (PLAN §7): each visible element marked
 * `data-aggregated="<source id>"` contains a visible <SourceTag> of that same source ("Source: …" for screen
 * readers). An item marked `data-aggregated="untagged"` passes only with a `data-untagged` reason from
 * E2E_UNTAGGED_EXEMPTIONS, so a new kind of untagged item fails here instead of passing unmarked. Returns how
 * many items were checked, so a spec can also require that there were some.
 */
export async function expectAllTagged(page: Page): Promise<number> {
  const report = await page.evaluate((exempt) => {
    const items = [...document.querySelectorAll<HTMLElement>("[data-aggregated]")].filter((el) =>
      el.checkVisibility(),
    );
    const untagged = items
      .filter((item) => {
        const source = item.dataset.aggregated ?? "";
        if (source === "untagged") return !exempt.includes(item.dataset.untagged ?? "");
        const tags = [...item.querySelectorAll<HTMLElement>("[data-source]")].filter(
          (tag) =>
            tag.dataset.source === source &&
            !tag.hasAttribute("data-aggregated") &&
            tag.checkVisibility() &&
            (tag.textContent ?? "").trim().startsWith("Source:"),
        );
        return tags.length === 0;
      })
      .map((item) => `${item.dataset.aggregated}: ${(item.textContent ?? "").trim().slice(0, 60)}`);
    return { count: items.length, untagged };
  }, E2E_UNTAGGED_EXEMPTIONS);
  expect(report.untagged, "aggregated items without their source tag").toEqual([]);
  return report.count;
}

/** What an L0 line may call each source (the registry label, plus the short forms the spec's L0 lines use). */
const L0_WORDS: Record<string, string[]> = Object.fromEntries(
  Object.values(SOURCES).map((s): [SourceId, string[]] => [s.id, [s.label.toLowerCase()]]),
);
L0_WORDS["catalog"]?.push("catalog");
L0_WORDS["hurt-hub-programs"]?.push("hurt hub");
L0_WORDS["davidson-offices"]?.push("office programs");

export interface AttributionReport {
  /** Visible [data-source] elements in <main> that were checked. */
  items: number;
  /** How each passed: its own source note or tag (NOTE), "your" wording (YOURS), AI, or its card's L0 line. */
  NOTE: number;
  YOURS: number;
  AI: number;
  L0: number;
  /** What failed, as readable lines (empty when every item is attributed). */
  problems: string[];
}

/**
 * The strict provenance check (spec §5.5 "Test", the e2e twin of the mockups' attributed.cjs). For every visible
 * `[data-source]` element E in <main>, with source id S, one of these must hold:
 *   NOTE   E is, or contains, a visible `[data-source=S]` whose text starts with the (sr-only) "Source:" and whose
 *          visible words name the source: today's SourceTag ("Source: " + "WildcatSync"), or the planned
 *          SourceNote ("Source: " + "via Dean Rusk International Studies Program", "Source: your plan. Your
 *          deadline").
 *   YOURS  S = my-plan: E's visible text, or the visible heading of a card or list around E, says "you"/"your" or
 *          a status string ("Completed Fall 2025", "Taking now", "In plan"), and E, that heading or that list
 *          carries "Source: your plan" for screen readers.
 *   AI     S = ai: E shows the word "AI" and carries "Source: AI".
 *   L0     the nearest `[data-provenance]` ancestor lists S, and its own visible L0 line (`.l0`) names S in words.
 * And: every `[data-provenance]` container's L0 line names each id it lists (except my-plan and ai); every link
 * that opens a new tab ends its name with "(opens in a new tab)"; and the "Sources" links have distinct names.
 * `attributionReport` measures; `expectAllAttributed` fails on any problem. (M1 replaces expectAllTagged with
 * it; until then the UI budgets spec reports its problems as warnings.)
 */
export async function expectAllAttributed(page: Page): Promise<AttributionReport> {
  const report = await attributionReport(page);
  expect(report.problems, "aggregated items without their source in words").toEqual([]);
  return report;
}

export async function attributionReport(page: Page): Promise<AttributionReport> {
  return page.evaluate((words) => {
    const main = document.querySelector("main");
    if (!main) return { problems: ["no <main>"], items: 0, NOTE: 0, YOURS: 0, AI: 0, L0: 0 };
    const SR = ".sr-only, .sr";
    const vis = (e: Element | null | undefined): e is HTMLElement =>
      !!e &&
      e.checkVisibility({ visibilityProperty: true }) &&
      e.getBoundingClientRect().height > 0;
    const visText = (e: Element) => {
      const copy = e.cloneNode(true) as Element;
      copy.querySelectorAll(SR).forEach((s) => s.remove());
      return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    };
    const srText = (e: Element) =>
      [
        ...[...e.querySelectorAll(SR)].map((s) => s.textContent ?? ""),
        e.matches(SR) ? (e.textContent ?? "") : "",
        e.getAttribute("aria-label") ?? "",
      ].join(" ");
    const l0Of = (p: Element) =>
      p.matches(".l0")
        ? p
        : [...p.querySelectorAll(".l0")].find(
            (l) => l.closest("[data-provenance]") === p && vis(l),
          );
    const names = (id: string, text: string) =>
      (words[id] ?? []).some((w) => text.toLowerCase().includes(w));
    const STATUS = /^(⚠\s*)?(completed (fall|spring|summer) \d{4}|taking now|in (your )?plan)/i;
    const out = { problems: [] as string[], items: 0, NOTE: 0, YOURS: 0, AI: 0, L0: 0 };

    for (const e of main.querySelectorAll<HTMLElement>("[data-source]")) {
      if (!vis(e)) continue;
      out.items++;
      const s = e.dataset.source ?? "";
      const notes = [e, ...e.querySelectorAll(`[data-source="${s}"]`)].filter(
        (n) =>
          vis(n) &&
          /^source:/i.test((n.textContent ?? "").trim()) &&
          visText(n).replace(/^via\s*/i, "").length > 1,
      );
      if (notes.length > 0) {
        out.NOTE++;
        continue;
      }
      if (s === "my-plan") {
        const candidates: Element[] = [e];
        for (let a = e.parentElement; a && a !== main; a = a.parentElement) {
          if (!a.matches("section, fieldset, ul, ol, dl, article")) continue;
          const heads = [...a.querySelectorAll("h2, h3, h4, legend")].filter(
            (h) =>
              vis(h) &&
              (h.contains(e) ||
                !!(h.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)),
          );
          if (heads.length) candidates.push(heads[heads.length - 1]!);
          if (a.matches("ul, ol") && a.getAttribute("aria-label")) candidates.push(a);
        }
        const says = candidates.some(
          (c) =>
            !c.matches("ul, ol") && (/\byou(r)?\b/i.test(visText(c)) || STATUS.test(visText(c))),
        );
        const sr = candidates.some((c) => /source:?\s*your plan/i.test(srText(c)));
        if (says && sr) {
          out.YOURS++;
          continue;
        }
      }
      if (s === "ai" && /\bAI\b/.test(visText(e)) && /source:?\s*AI\b/i.test(srText(e))) {
        out.AI++;
        continue;
      }
      const p = e.closest<HTMLElement>("[data-provenance]");
      if (p && (p.dataset.provenance ?? "").split(/\s+/).includes(s)) {
        const l0 = l0Of(p);
        if (l0 && names(s, visText(l0))) {
          out.L0++;
          continue;
        }
      }
      out.problems.push(`${s}: ${visText(e).slice(0, 60)}`);
    }

    for (const p of main.querySelectorAll<HTMLElement>("[data-provenance]")) {
      if (!vis(p)) continue;
      const l0 = l0Of(p);
      const text = l0 ? visText(l0) : "";
      for (const id of (p.dataset.provenance ?? "").split(/\s+/).filter(Boolean)) {
        if (id === "my-plan" || id === "ai") continue;
        if (!names(id, text))
          out.problems.push(`container lists ${id}; its L0 says "${text.slice(0, 60)}"`);
      }
    }
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[target=_blank]")) {
      if (!vis(a)) continue;
      const name = (a.getAttribute("aria-label") ?? a.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (!/\(opens in a new tab\)$/.test(name))
        out.problems.push(`new-tab link without the cue: ${name.slice(0, 50)}`);
    }
    const sourcesLinks = [...main.querySelectorAll("a")]
      .filter((a) => vis(a) && /^sources$/i.test(visText(a)))
      .map((a) => a.getAttribute("aria-label") ?? "Sources");
    for (const [i, n] of sourcesLinks.entries()) {
      if (sourcesLinks.indexOf(n) !== i) out.problems.push(`two "Sources" links named "${n}"`);
    }
    return out;
  }, L0_WORDS);
}

/**
 * Tap targets in <main> under 44px tall (PLAN §7: tap targets ≥44px on mobile), as readable lines. Checks every
 * visible link, button and <summary>. Exempt, as WCAG 2.5.8 exempts them: a link inside a sentence (a <p> with
 * other text around it). A link stretched over its card (an absolutely positioned ::after) is measured by that
 * card. Visually hidden elements (1px) are skipped.
 */
export async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return ["no <main>"];
    const out: string[] = [];
    for (const el of main.querySelectorAll<HTMLElement>("a[href], button, summary")) {
      if (!el.checkVisibility()) continue;
      let rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const sentence = el.closest("p");
      if (sentence && sentence !== el) {
        const own = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        const around = (sentence.textContent ?? "").replace(/\s+/g, " ").trim();
        if (around.length > own.length) continue;
      }
      const after = getComputedStyle(el, "::after");
      if (after.position === "absolute" && after.content !== "none") {
        const card = el.offsetParent;
        if (card) rect = card.getBoundingClientRect();
      }
      if (rect.height < 43.5) {
        const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 50);
        out.push(
          `${el.tagName.toLowerCase()} "${label}": ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
      }
    }
    return out;
  });
}
