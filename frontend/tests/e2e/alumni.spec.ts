import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { expect, test } from "@playwright/test";
import {
  collectErrors,
  horizontalOverflow,
  isMobile,
  newSignedInAccount,
  newVerifiedAccount,
  PASSWORD,
  seriousViolations,
  signIn,
  smallTapTargets,
} from "./helpers";

/**
 * /alumni (W9a): the verified directory for verified @davidson.edu accounts only (PLAN §1). Three kinds of viewer:
 * a verified Davidson account (the data), an unverified Davidson account (a verify step, no data) and a legacy
 * non-Davidson account (the owner's message, no data). Runs at desktop 1440 and phone 390.
 */

const UNVERIFIED_MESSAGE =
  "The alumni network and AI features are limited to verified @davidson.edu accounts.";

test("a verified @davidson.edu account gets the directory, with provenance and URL filters", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await newVerifiedAccount(page, request, "e2e-alumni");

  const response = await page.goto("/alumni");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Alumni" })).toBeVisible();
  const provenance = page.getByTestId("alumni-provenance");
  await expect(provenance).toContainText(
    /Compiled from public sources · checked \w{3} \d{1,2}, \d{4} · Request removal\/correction/,
  );
  // To the privacy notice's alumni section (how to ask privately), not a public code repository.
  await expect(
    provenance.getByRole("link", { name: "Request removal/correction" }),
  ).toHaveAttribute("href", "/privacy#alumni");
  const cards = page.locator("[data-alumnus]");
  const total = await cards.count();
  expect(total).toBeGreaterThan(10);
  await expect(page.getByTestId("alumni-count")).toHaveText(`${total} verified alumni`);

  // Notable alumni (contactable=false) are apart and offer no contact.
  const notable = page.getByTestId("notable-alumni");
  await expect(notable.getByRole("heading", { name: /Notable alumni/ })).toBeVisible();
  expect(await notable.locator('[data-contactable="false"]').count()).toBeGreaterThan(0);
  await expect(notable.locator("[data-contact]")).toHaveCount(0);
  await expect(notable.locator('[data-contactable="true"]')).toHaveCount(0);
  // Everyone else can be reached on LinkedIn; "see LinkedIn" stands in for LinkedIn-only fields.
  await expect(
    page.locator('[data-contactable="true"] [data-contact="linkedin"]').first(),
  ).toBeVisible();
  await expect(page.getByText("see LinkedIn").first()).toBeVisible();

  // The sources disclosure shows that it opens.
  const firstSources = cards.first().locator("summary");
  await expect(firstSources.locator("svg")).toBeVisible();

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await seriousViolations(page)).toEqual([]);
  if (isMobile(page)) expect(await smallTapTargets(page), "tap targets under 44px").toEqual([]);

  // Filters are a GET form: the URL holds them.
  await page.getByLabel("Career path").selectOption("medicine");
  const apply = page.getByRole("button", { name: "Apply" });
  if (isMobile(page)) await apply.tap();
  else await apply.click();
  await expect(page).toHaveURL(/\/alumni\?.*career=medicine/);
  const medicine = await cards.count();
  expect(medicine).toBeGreaterThan(0);
  expect(medicine).toBeLessThan(total);
  await expect(page.getByTestId("alumni-count")).toHaveText(
    `Showing ${medicine} of ${total} verified alumni`,
  );
  await expect(page.getByLabel("Career path")).toHaveValue("medicine");

  // Back: the list and the controls both follow the URL (the browser does not restore the old choice).
  await page.goBack();
  await expect(page).toHaveURL(/\/alumni$/);
  await expect(page.getByTestId("alumni-count")).toHaveText(`${total} verified alumni`);
  await expect(page.getByLabel("Career path")).toHaveValue("");
  const year = page.getByLabel("Class year");
  const firstYear = await year.locator("option").nth(1).getAttribute("value");
  await year.selectOption(firstYear!);
  if (isMobile(page)) await apply.tap();
  else await apply.click();
  await expect(page).toHaveURL(new RegExp(`/alumni\\?.*year=${firstYear}`));
  await page.goBack();
  await expect(page).toHaveURL(/\/alumni$/);
  await expect(page.getByLabel("Class year")).toHaveValue("");

  // Nobody matches: an empty state with a way back.
  await page.goto("/alumni?q=zzzz%20nobody");
  await expect(page.getByRole("heading", { name: "No alumni match these filters" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Clear filters" }).first().click();
  await expect(page).toHaveURL(/\/alumni$/);
  await expect(cards).toHaveCount(total);
  expect(errors).toEqual([]);
});

test("an unverified @davidson.edu account is asked to verify and sees no alumni", async ({
  page,
  request,
}) => {
  const email = await newSignedInAccount(page, request, "e2e-alumni-unverified");
  await page.goto("/alumni?career=law");
  const gate = page.getByTestId("alumni-gate");
  await expect(gate).toContainText("Verify your Davidson email to see alumni");
  await expect(gate).toContainText(UNVERIFIED_MESSAGE);
  await expect(page.locator("[data-alumnus]")).toHaveCount(0);
  await expect(page.locator('a[href*="linkedin.com"]')).toHaveCount(0);
  expect(await seriousViolations(page)).toEqual([]);

  // Verifying comes back to the same filtered directory.
  await gate.getByRole("link", { name: "Verify your email" }).click();
  await expect(page).toHaveURL(/\/verify\?reason=davidson&next=%2Falumni%3Fcareer%3Dlaw$/);
  await expect(page.getByText(email)).toBeVisible();
});

test("a legacy non-Davidson account gets the owner's message, not the alumni", async ({ page }) => {
  const uri = process.env.E2E_MONGODB_URI;
  test.skip(
    !uri,
    "needs E2E_MONGODB_URI: new sign-ups must be @davidson.edu, so the legacy account is written to the database",
  );
  const email = `e2e-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@gmail.com`;
  const conn = await mongoose.createConnection(uri!).asPromise();
  try {
    // A hackathon-era account, and even with a verified mailbox: only @davidson.edu opens alumni.
    await conn.collection("users").insertOne({
      name: "Legacy Friend",
      email,
      password: await bcrypt.hash(PASSWORD, 4),
      emailVerifiedAt: new Date("2026-09-01T12:00:00Z"),
      createdAt: new Date("2026-02-01T12:00:00Z"),
      updatedAt: new Date("2026-02-01T12:00:00Z"),
    });
  } finally {
    await conn.close();
  }

  await signIn(page, email, PASSWORD);
  await page.goto("/alumni");
  await expect(page.getByTestId("alumni-gate")).toContainText(UNVERIFIED_MESSAGE);
  await expect(page.getByRole("link", { name: "Verify your email" })).toHaveCount(0);
  await expect(page.locator("[data-alumnus]")).toHaveCount(0);

  await page.goto("/careers/law");
  await expect(page.getByTestId("alumni-gate")).toContainText(UNVERIFIED_MESSAGE);
  await expect(page.locator("[data-alumnus]")).toHaveCount(0);
  // The rest of the career page is theirs: careers are open to every signed-in account.
  await expect(page.getByTestId("career-courses")).toBeVisible();
});
