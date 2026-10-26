import mongoose from "mongoose";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ALT_ORIGIN, PASSWORD, uniqueEmail } from "./helpers";

/**
 * The owner's TEMPORARY AI_ALLOW_UNVERIFIED switch (server/ai/access.ts), on the second e2e server that
 * playwright.config.ts starts with it on (same build, same database, mock AI provider). An @davidson.edu student who
 * has not verified the address consents on Profile and then gets AI (the course About summary, a career plan), but
 * never alumni data or cold e-mail, and a "Report this" from them is kept without counting toward hiding the shared
 * answer. Remove this spec, and the second server, with the switch.
 */

test.use({ baseURL: E2E_ALT_ORIGIN });

/** State-changing calls carry the second server's Origin (its APP_ORIGIN). */
const SAME_ORIGIN = { origin: E2E_ALT_ORIGIN } as const;

/** A new @davidson.edu account, never verified, signed in on the second server and marked onboarded. */
async function unverifiedStudent(page: Page, prefix: string): Promise<string> {
  const email = uniqueEmail(prefix);
  const res = await page.request.post("/api/auth/register", {
    data: { name: "Uma Unverified", email, password: PASSWORD },
    headers: SAME_ORIGIN,
  });
  expect(res.status()).toBe(202);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  const onboarded = await page.request.patch("/api/profile", {
    data: { onboarded: true },
    headers: SAME_ORIGIN,
  });
  expect(onboarded.status()).toBe(200);
  return email;
}

test("an unverified @davidson.edu student consents on Profile and gets the course About summary", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await unverifiedStudent(page, "e2e-ai-unverified");

  // Before consenting: the panel asks for consent, not for a verified address.
  await page.goto("/courses/202602/CSC-221");
  const about = page.getByTestId("course-about-ai");
  await expect(about.getByTestId("about-gate")).toContainText(
    "Turn on AI features in your profile to use this.",
  );
  await expect(about.getByRole("link", { name: "Verify your Davidson email" })).toHaveCount(0);

  // Profile: the AI section says what still needs a verified address, and takes consent with the 18+ attestation.
  await page.goto("/profile#ai-features");
  await page.waitForLoadState("networkidle");
  const section = page.locator("#ai-features");
  await expect(section).toContainText(
    "For now, AI features work before your @davidson.edu address is verified.",
  );
  await expect(section).not.toContainText("limited to verified @davidson.edu accounts");
  const attest = section.getByRole("checkbox", { name: "I am 18 or older" });
  await attest.click();
  await expect(attest).toBeChecked();
  await section.getByRole("button", { name: "Turn on AI features" }).click();
  await expect(section.getByRole("button", { name: "Turn off AI features" })).toBeVisible();

  // The summary, marked as AI.
  await page.goto("/courses/202602/CSC-221");
  await expect(about.getByTestId("about-ok")).toBeVisible();
  await expect(about).toContainText("AI · verify with your advisor");
  await expect(about.getByTestId("about-gate")).toHaveCount(0);

  // "Report this" is accepted, but an unverified report does not count toward hiding the shared summary.
  await page.waitForLoadState("networkidle");
  await about.getByRole("button", { name: "Report this summary" }).click();
  await expect(about.getByRole("status").filter({ hasText: "Thanks." })).toBeVisible();
  const uri = process.env.E2E_MONGODB_URI;
  if (uri) {
    const conn = await mongoose.createConnection(uri).asPromise();
    try {
      const entry = await conn
        .collection("aicache_v2")
        .findOne(
          { feature: "course-about", scope: "shared", "reports.entries.verified": false },
          { sort: { updatedAt: -1 } },
        );
      expect(entry?.hidden).toBe(false);
      // Other specs' verified students may have reported CSC 221 too: only theirs are counted.
      const entries = (entry?.reports?.entries ?? []) as {
        userId: unknown;
        reporter?: string | null;
        verified?: boolean;
      }[];
      const counting = new Set(
        entries.filter((e) => e.verified !== false).map((e) => e.reporter ?? String(e.userId)),
      );
      expect(entry?.reports?.count).toBe(counting.size);
    } finally {
      await conn.close();
    }
  }
});

test("with the switch on, an unverified student gets a career plan but no alumni and no cold e-mail", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await unverifiedStudent(page, "e2e-ai-unverified-careers");
  const consent = await page.request.put("/api/profile/ai-consent", {
    data: { adultAttested: true },
    headers: SAME_ORIGIN,
  });
  expect(consent.status()).toBe(200);

  await page.goto("/careers/medicine");
  await expect(page.getByRole("button", { name: "Draft my career plan" })).toBeVisible();
  const email = page.getByRole("region", { name: /Email an alumnus/ });
  await expect(email).toContainText(
    "The alumni network and cold-email drafts are limited to verified @davidson.edu accounts.",
  );
  await expect(email.getByRole("radio")).toHaveCount(0);
  // No alumni data reaches the page.
  expect(await page.content()).not.toContain("Rahael Borchers");

  // The route agrees with the page.
  const coldEmail = await page.request.post("/api/ai/cold-email", {
    data: { alumnusId: "neil-patel" },
    headers: SAME_ORIGIN,
  });
  expect(coldEmail.status()).toBe(403);
  expect(await coldEmail.json()).toMatchObject({ kind: "unverified" });

  // The alumni directory stays closed.
  await page.goto("/alumni");
  await expect(page.getByTestId("alumni-gate")).toBeVisible();
  expect(await page.content()).not.toContain("Rahael Borchers");
});
