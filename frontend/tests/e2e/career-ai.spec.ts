import { expect, test, type Page } from "@playwright/test";
import { collectErrors, registerViaApi, SAME_ORIGIN, signIn, uniqueEmail } from "./helpers";
import {
  expectAllTagged,
  horizontalOverflow,
  isMobile,
  seriousViolations,
  smallTapTargets,
  verifyMailbox,
} from "../w9a/e2e";

/**
 * The AI panels on /careers/[slug] (W9a-ai) against the production build with AI_PROVIDER=mock and fixtures
 * (server "now" 2026-09-30): the gate for an unverified account, the career plan with catalog titles and "Send
 * to my plan" (→ a pending draft in My plan → Suggestions), and the cold e-mail to a contactable alumnus with
 * {{studentName}} filled in the browser. Desktop 1440 and phone 390.
 */

const PASSWORD = "career ai e2e password 7";

async function newStudent(
  page: Page,
  prefix: string,
  name: string,
  opts: { verified: boolean; consent: boolean },
) {
  const email = uniqueEmail(prefix);
  await registerViaApi(page.request, { name, email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
  if (opts.verified) await verifyMailbox(page, email);
  if (opts.consent) {
    const res = await page.request.put("/api/profile/ai-consent", {
      data: { adultAttested: true },
      headers: SAME_ORIGIN,
    });
    expect(res.status()).toBe(200);
  }
  return email;
}

test("an unverified account sees why AI is closed, with the verify step, and no alumni", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await newStudent(page, "e2e-cai-unv", "Uma Unverified", { verified: false, consent: false });
  expect((await page.goto("/careers/medicine"))?.status()).toBe(200);
  const notice = page.getByTestId("ai-shared-gate");
  await expect(notice).toContainText("limited to verified @davidson.edu accounts");
  await expect(notice.getByRole("link", { name: "Verify your email" })).toHaveAttribute(
    "href",
    "/verify?reason=davidson&next=%2Fcareers%2Fmedicine",
  );
  await expect(page.getByRole("button", { name: "Draft my career plan" })).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the AI career plan: official titles and availability, then Send to my plan → Suggestions", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await newStudent(page, "e2e-cai-plan", "Pat Planner", { verified: true, consent: true });
  expect((await page.goto("/careers/software-engineering"))?.status()).toBe(200);

  const card = page.getByRole("region", { name: /^Your AI career plan/ });
  await card.getByRole("button", { name: "Draft my career plan" }).click();
  const result = card.getByTestId("ai-career-plan-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result.getByText("AI-generated content: verify with your advisor")).toBeAttached();
  await expect(result.getByTestId("ai-plan-overview")).not.toBeEmpty();

  const picks = result.getByTestId("ai-course-pick");
  const pickCount = await picks.count();
  expect(pickCount).toBeGreaterThan(0);
  // Each pick gets its official title from the catalog and a term status with its COURSE SCHEDULE tag.
  const first = picks.first();
  await expect(first.getByTestId("ai-course-title")).toBeVisible();
  await expect(first.getByTestId("ai-course-term")).toHaveText(
    /^(Offered in|Not offered in|\w+ \d{4}(:| isn’t))/,
  );
  await expect(page.getByText("Checking the schedule…")).toHaveCount(0);
  expect(await expectAllTagged(page)).toBeGreaterThan(0);

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
  if (isMobile(page)) expect(await smallTapTargets(page), "tap targets under 44px").toEqual([]);

  await result.getByRole("button", { name: "Send to my plan" }).click();
  await expect(page).toHaveURL(/\/plan\?tab=suggestions$/);

  const drafts = await page.request.get("/api/plan/drafts");
  expect(drafts.status()).toBe(200);
  expect(drafts.headers()["cache-control"]).toBe("private, no-store");
  const { drafts: list } = (await drafts.json()) as {
    drafts: { kind: string; status: string; items: unknown[] }[];
  };
  expect(list[0]).toMatchObject({ kind: "career-plan", status: "pending" });
  expect(list[0]!.items).toHaveLength(pickCount);
  expect(errors).toEqual([]);
});

test("cold email: contactable alumni only, the student's name filled in the browser, copied", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await newStudent(page, "e2e-cai-mail", "Quinn Coldmail", { verified: true, consent: true });
  expect((await page.goto("/careers/medicine"))?.status()).toBe(200);

  const card = page.getByRole("region", { name: /^Email an alumnus/ });
  const group = card.getByRole("group", { name: "Who would you like to write to?" });
  await expect(group.getByRole("radio", { name: /Rahael Borchers/ })).toBeVisible();
  // Notable alumni (public figures, trustees, college officers) are never offered a cold email.
  await expect(group.getByText("Sallie Permar")).toHaveCount(0);
  await expect(group.getByText("Thomas Marshburn")).toHaveCount(0);

  await group.getByText("Rahael Borchers").click();
  await card.getByRole("button", { name: "Draft an email" }).click();
  const result = card.getByTestId("ai-email-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  const body = result.getByTestId("ai-email-body");
  await expect(body).toContainText("Dear Rahael Borchers");
  await expect(body).toContainText("Quinn Coldmail");
  await expect(body).not.toContainText("{{studentName}}");

  await result.getByRole("button", { name: "Copy email" }).click();
  await expect(card.getByTestId("ai-copy-status")).toHaveText("The email is on your clipboard.");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Subject: /);
  expect(copied).toContain("Quinn Coldmail");

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
  if (isMobile(page)) expect(await smallTapTargets(page), "tap targets under 44px").toEqual([]);
  expect(errors).toEqual([]);
});
