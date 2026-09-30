import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { registerViaApi, signIn, uniqueEmail } from "../e2e/helpers";

/**
 * Shared helpers for the W9a Playwright specs (tests/e2e/careers.spec.ts, tests/e2e/alumni.spec.ts).
 * Not a test file itself (Playwright only runs tests/e2e/*.spec.ts).
 */

export const PASSWORD = "w9a e2e password 42";

/** A new @davidson.edu account, signed in (unverified: the e2e server's console mailer holds its code). */
export async function newSignedInAccount(
  page: Page,
  request: APIRequestContext,
  prefix: string,
): Promise<string> {
  const email = uniqueEmail(prefix);
  await registerViaApi(request, { name: "Wren Careers", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
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

/** axe violations of serious or critical impact (WCAG 2.2 AA tags), as readable lines. */
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
 * Every aggregated item on the page carries its source tag (PLAN §7): each visible element marked
 * `data-aggregated="<source id>"` contains a visible <SourceTag> of that same source ("Source: …" for screen
 * readers). Returns how many items were checked, so a spec can also require that there were some.
 * (contractRequest: move this into tests/e2e/helpers.ts for the W7/W8/W9 specs.)
 */
export async function expectAllTagged(page: Page): Promise<number> {
  const report = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>("[data-aggregated]")].filter((el) =>
      el.checkVisibility(),
    );
    const untagged = items
      .filter((item) => {
        const source = item.dataset.aggregated ?? "";
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
  });
  expect(report.untagged, "aggregated items without their source tag").toEqual([]);
  return report.count;
}
