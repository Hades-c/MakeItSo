import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { registerViaApi, SAME_ORIGIN, signIn, uniqueEmail } from "../e2e/helpers";

/**
 * Shared helpers for the W5u Playwright spec (tests/e2e/plan.spec.ts). Not a test file (Playwright runs only
 * tests/e2e/*.spec.ts).
 */

export const PASSWORD = "w5u e2e password 42";

/** A new @davidson.edu account (class of 2029, started Fall 2025), signed in. */
export async function newPlanner(
  page: Page,
  request: APIRequestContext,
  prefix: string,
): Promise<string> {
  const email = uniqueEmail(prefix);
  await registerViaApi(request, { name: "Wes Planner", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
  const profile = await page.request.patch("/api/profile", {
    data: { graduationYear: 2029, firstTerm: "202501" },
    headers: SAME_ORIGIN,
  });
  expect(profile.status(), await profile.text()).toBe(200);
  return email;
}

/** Verify the mailbox through the console mailer's test inbox, then grant AI consent (18+ attested). */
export async function verifyAndConsent(page: Page, email: string): Promise<void> {
  let code: string | null = null;
  await expect
    .poll(async () => {
      const res = await page.request.get(
        `/api/auth/test-mailbox?email=${encodeURIComponent(email)}`,
      );
      const { messages } = (await res.json()) as {
        messages: { kind: string; code: string | null }[];
      };
      code = [...messages].reverse().find((m) => m.kind === "verify-email")?.code ?? null;
      return code;
    })
    .toMatch(/^\d{6}$/);
  const verified = await page.request.post("/api/account/verify", {
    data: { code },
    headers: SAME_ORIGIN,
  });
  expect(verified.status()).toBe(200);
  const consent = await page.request.put("/api/profile/ai-consent", {
    data: { adultAttested: true },
    headers: SAME_ORIGIN,
  });
  expect(consent.status()).toBe(200);
}

export async function addItem(page: Page, body: Record<string, unknown>): Promise<string> {
  const res = await page.request.post("/api/plan/items", { data: body, headers: SAME_ORIGIN });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { item: { id: string } }).item.id;
}

/** axe violations of serious or critical impact (WCAG 2.2 AA), as readable lines. */
export async function seriousViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 720;
}

/**
 * Visible buttons and links in <main> under 44px tall (PLAN §7 tap targets on mobile). Links inside a sentence
 * and visually hidden elements are exempt.
 */
export async function smallTapTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return ["no <main>"];
    const out: string[] = [];
    for (const el of main.querySelectorAll<HTMLElement>("a[href], button, select, input")) {
      if (!el.checkVisibility()) continue;
      // Radios, checkboxes and switches sit in a 44px row with their label, which is the tap target.
      if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox"))
        continue;
      if (el.getAttribute("role") === "switch" || el.getAttribute("role") === "checkbox") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const sentence = el.closest("p");
      if (sentence && sentence !== el) {
        const own = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        const around = (sentence.textContent ?? "").replace(/\s+/g, " ").trim();
        if (around.length > own.length) continue;
      }
      if (rect.height < 43.5) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(rect.height)}px`,
        );
      }
    }
    return out;
  });
}

/** Every visible [data-source] item marked as an aggregated row holds a visible source tag ("Source: …"). */
export async function untaggedRows(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((row) => row.checkVisibility())
      .filter((row) => {
        const source = row.dataset.source;
        return ![...row.querySelectorAll<HTMLElement>("[data-source]")].some(
          (tag) =>
            tag !== row &&
            tag.dataset.source === source &&
            (tag.textContent ?? "").trim().startsWith("Source:"),
        );
      })
      .map((row) => (row.textContent ?? "").trim().slice(0, 60));
  }, selector);
}
