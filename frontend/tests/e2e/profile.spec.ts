import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  collectErrors,
  formError,
  horizontalOverflow,
  registerViaApi,
  seriousViolations,
  signIn,
  uniqueEmail,
} from "./helpers";

/**
 * /profile (W9b) end to end, against W3's real profile, consent and account routes: edit and clear, interests,
 * AI consent on/off, verifying from the profile, change password (the other device's session is revoked), the
 * data download, sign out everywhere and account deletion.
 */

const PASSWORD = "profile e2e password";

async function newStudent(page: Page, request: APIRequestContext, prefix: string) {
  const email = uniqueEmail(prefix);
  await registerViaApi(request, { name: "Casey Wildcat", email, password: PASSWORD });
  await signIn(page, email, PASSWORD);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();
  return email;
}

interface ProfileBody {
  profile: {
    name: string;
    majors: string[];
    minors: string[];
    graduationYear: number;
    firstTerm: string | null;
    standingOverride: string | null;
    interests: string[];
    aiConsentAt: string | null;
    adultAttestedAt: string | null;
    emailVerifiedAt: string | null;
  };
}

async function storedProfile(page: Page) {
  const res = await page.request.get("/api/profile");
  expect(res.status()).toBe(200);
  return ((await res.json()) as ProfileBody).profile;
}

/** Pick an option of a Lakeside (Radix) select by the select's label. */
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(page.getByRole("combobox", { name: label })).toContainText(option);
}

/**
 * Tabs through the page and lists every focused control whose box lies entirely under the fixed bottom tabs
 * (WCAG 2.2 SC 2.4.11 Focus Not Obscured), which axe cannot detect. Phones only (the tabs are hidden from md).
 */
async function obscuredByBottomTabs(page: Page, presses: number) {
  const hidden: string[] = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press("Tab");
    const offender = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="bottom-tabs"]');
      const active = document.activeElement;
      if (!bar || !(active instanceof HTMLElement) || bar.contains(active)) return null;
      const box = active.getBoundingClientRect();
      if (box.height === 0) return null;
      return box.top >= bar.getBoundingClientRect().top
        ? `${active.tagName} "${(active.textContent ?? "").trim().slice(0, 40)}" at y=${Math.round(box.top)}`
        : null;
    });
    if (offender) hidden.push(offender);
  }
  return hidden;
}

test("profile: every area renders, accessibly, without sideways scrolling", async ({
  page,
  request,
}) => {
  const errors = collectErrors(page);
  await newStudent(page, request, "e2e-profile-a11y");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.reload();
    for (const name of [
      "Account",
      "Academics",
      "Interests",
      "AI features",
      "Security",
      "Your data",
    ]) {
      await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByText("Not verified")).toBeVisible();
    expect(await horizontalOverflow(page), "scrolls sideways").toBeLessThanOrEqual(0);
    expect(await seriousViolations(page), `axe ${colorScheme}`).toEqual([]);
  }
  // The delete dialog too.
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("dialog", { name: "Delete your account?" })).toBeVisible();
  expect(await seriousViolations(page), "axe dialog").toEqual([]);
  // The open dialog lives in the URL, and a reload shows it again (without submitting anything).
  await expect(page).toHaveURL(/\/profile\?dialog=delete-account$/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Delete your account?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(/\/profile$/);
  // With a select open. Radix Select sets aria-hidden on the shell root, which still holds focusable links, so
  // axe reports aria-hidden-focus there: a shared components/ui/select.tsx / AppShell matter (contractRequest
  // filed with W0b). Tab cannot leave the open listbox, so that one rule is set aside for this state only.
  await page.getByRole("combobox", { name: "Graduation year" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const withSelectOpen = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .disableRules(["aria-hidden-focus"])
    .analyze();
  expect(
    withSelectOpen.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    "axe select open",
  ).toEqual([]);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("profile: edit academics, name and interests, reload, then clear them", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await newStudent(page, request, "e2e-profile-edit");

  // Name: saved, and the shell shows it.
  await page.getByLabel("Name", { exact: true }).fill("Casey Q. Wildcat");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Name saved.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Account menu for Casey Q. Wildcat" }),
  ).toBeVisible();

  // Academics.
  const academics = page.getByRole("region", { name: "Academics" });
  await academics.getByRole("button", { name: "Add a major" }).click();
  await choose(page, "Major 1", "Major in Computer Science (B.S. Degree)");
  await academics.getByRole("button", { name: "Add a minor" }).click();
  await choose(page, "Minor 1", "Interdisciplinary Minor in Data Science");
  await choose(page, "Graduation year", "Class of 2028");
  await choose(page, "First term at Davidson", "Fall 2024");
  await choose(page, "Class standing", "Senior");
  await academics.getByRole("button", { name: "Save academics" }).click();
  await expect(academics.getByText("Academics saved.")).toBeVisible();

  // Interests save on their own.
  const interests = page.getByRole("region", { name: "Interests" });
  await interests.getByRole("button", { name: "Software Engineering" }).click();
  await interests.getByRole("button", { name: "Law", exact: true }).click();
  await expect(interests.getByTestId("interests-status")).toHaveText(/^2 of \d+ chosen, saved\.$/);

  expect(await storedProfile(page)).toMatchObject({
    name: "Casey Q. Wildcat",
    majors: ["Major in Computer Science (B.S. Degree)"],
    minors: ["Interdisciplinary Minor in Data Science"],
    graduationYear: 2028,
    firstTerm: "202401",
    standingOverride: "senior",
    interests: ["software-engineering", "law"],
  });

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Major 1" })).toHaveText(
    "Major in Computer Science (B.S. Degree)",
  );
  // A long official name truncates inside its select instead of widening the page (phones).
  expect(await horizontalOverflow(page), "scrolls sideways").toBeLessThanOrEqual(0);
  await expect(page.getByRole("combobox", { name: "First term at Davidson" })).toHaveText(
    "Fall 2024",
  );
  await expect(page.getByRole("combobox", { name: "Class standing" })).toHaveAccessibleDescription(
    /Senior \(set by you\)/,
  );
  await expect(
    page
      .getByRole("region", { name: "Interests" })
      .getByRole("button", { name: "Law", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Clear.
  await page
    .getByRole("button", { name: "Remove Major in Computer Science (B.S. Degree)" })
    .click();
  await page
    .getByRole("button", { name: "Remove Interdisciplinary Minor in Data Science" })
    .click();
  await choose(page, "First term at Davidson", "Not set");
  await choose(page, "Class standing", "From my graduation year (Junior)");
  await page.getByRole("button", { name: "Save academics" }).click();
  await expect(page.getByText("Academics saved.")).toBeVisible();
  const chips = page.getByRole("region", { name: "Interests" });
  await chips.getByRole("button", { name: "Software Engineering" }).click();
  await chips.getByRole("button", { name: "Law", exact: true }).click();
  await expect(chips.getByTestId("interests-status")).toHaveText(/^0 of \d+ chosen, saved\.$/);

  await page.reload();
  expect(await storedProfile(page)).toMatchObject({
    majors: [],
    minors: [],
    graduationYear: 2028,
    firstTerm: null,
    standingOverride: null,
    interests: [],
  });
  await expect(page.getByText("No major chosen.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Class standing" })).toHaveAccessibleDescription(
    /Junior \(from your graduation year\)/,
  );
});

test("profile: a field error is announced and focused", async ({ page, request }) => {
  await newStudent(page, request, "e2e-profile-errors");
  await choose(page, "First term at Davidson", "Fall 2026");
  await choose(page, "Graduation year", "Class of 2026");
  await page.getByRole("button", { name: "Save academics" }).click();
  await expect(formError(page).filter({ hasText: "Check the highlighted fields" })).toContainText(
    "First term at Davidson: The first term and the graduation year do not fit together.",
  );
  await expect(page.getByRole("combobox", { name: "First term at Davidson" })).toBeFocused();
});

test("profile: AI features need the 18+ attestation, and turn on and off", async ({
  page,
  request,
}) => {
  await newStudent(page, request, "e2e-profile-ai");
  const ai = page.getByRole("region", { name: "AI features" });
  await expect(ai).toContainText("Claude, a model made by Anthropic");
  await expect(ai).toContainText(
    "never sends your name, your email address, your account id or any grades",
  );
  await expect(ai.getByTestId("ai-consent-state")).toContainText("Off");

  await ai.getByRole("button", { name: "Turn on AI features" }).click();
  await expect(formError(page).filter({ hasText: "18 or older" })).toBeVisible();
  await expect(ai.getByRole("checkbox", { name: "I am 18 or older" })).toBeFocused();
  expect((await storedProfile(page)).aiConsentAt).toBeNull();

  await ai.getByRole("checkbox", { name: "I am 18 or older" }).click();
  await ai.getByRole("button", { name: "Turn on AI features" }).click();
  await expect(ai.getByText("AI features are on.")).toBeVisible();
  const on = await storedProfile(page);
  expect(on.aiConsentAt).not.toBeNull();
  expect(on.adultAttestedAt).not.toBeNull();

  await page.reload();
  const again = page.getByRole("region", { name: "AI features" });
  await expect(again.getByTestId("ai-consent-state")).toContainText(
    "You turned AI features on Sep 30, 2026.",
  );
  await again.getByRole("button", { name: "Turn off AI features" }).click();
  await expect(again.getByText("AI features are off.")).toBeVisible();
  const off = await storedProfile(page);
  expect(off.aiConsentAt).toBeNull();
  expect(off.adultAttestedAt).not.toBeNull();
});

test("profile: verify the mailbox from the profile and come back", async ({ page, request }) => {
  const email = await newStudent(page, request, "e2e-profile-verify");
  await page.getByRole("link", { name: "Verify your email" }).first().click();
  await expect(page).toHaveURL(/\/verify\?next=%2Fprofile$/);
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
  await page.getByLabel("Verification code").fill(code!);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(
    page.getByRole("region", { name: "Account" }).getByText("Verified", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Not verified")).toHaveCount(0);
});

test("profile: changing the password keeps this browser signed in and signs the other device out", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("e2e-profile-password");
  await registerViaApi(request, { name: "Two Devices", email, password: PASSWORD });
  const laptop = await browser.newContext();
  const phone = await browser.newContext();
  try {
    const laptopPage = await laptop.newPage();
    const phonePage = await phone.newPage();
    await signIn(laptopPage, email, PASSWORD);
    await signIn(phonePage, email, PASSWORD);

    await laptopPage.goto("/profile");
    const security = laptopPage.getByRole("region", { name: "Security" });
    await security.getByLabel("Current password").fill("not the password");
    await security.getByLabel("New password", { exact: true }).fill("a new profile password");
    await security.getByLabel("Confirm new password").fill("a new profile password");
    await security.getByRole("button", { name: "Change password" }).click();
    await expect(
      formError(laptopPage).filter({ hasText: "Check the highlighted fields" }),
    ).toContainText("Current password: That password is not right.");
    await expect(security.getByLabel("Current password")).toBeFocused();

    await security.getByLabel("Current password").fill(PASSWORD);
    await security.getByRole("button", { name: "Change password" }).click();
    await expect(
      security.getByText(/Password changed\. Every other device was signed out/),
    ).toBeVisible();

    // This browser signed back in with the new password; the phone's session was revoked.
    await laptopPage.goto("/today");
    await expect(laptopPage).toHaveURL(/\/today$/);
    await phonePage.goto("/today");
    await expect(phonePage).toHaveURL(/\/login\?callbackUrl=%2Ftoday$|\/login$/);

    await phonePage.goto("/login");
    await phonePage.getByLabel("Email").fill(email);
    await phonePage.getByLabel("Password").fill(PASSWORD);
    await phonePage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(formError(phonePage)).toHaveText("Invalid email or password");
    await phonePage.getByLabel("Password").fill("a new profile password");
    await phonePage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(phonePage).toHaveURL(/\/today$/);
  } finally {
    await laptop.close();
    await phone.close();
  }
});

test("profile: download my data as a JSON file", async ({ page, request }) => {
  const email = await newStudent(page, request, "e2e-profile-export");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("makeitso-data-2026-09-30.json");
  const data = JSON.parse(await readFile(await file.path(), "utf8")) as {
    exportedAt: string;
    profile: Record<string, unknown>;
    data: Record<string, unknown>;
  };
  expect(data.profile.email).toBe(email);
  expect(data.profile).not.toHaveProperty("password");
  expect(Object.keys(data.data)).toEqual(
    expect.arrayContaining(["verificationcodes", "ratelimits"]),
  );
  await expect(page.getByText("Your download has started.")).toBeVisible();
});

test("profile: sign out everywhere", async ({ page, request }) => {
  await newStudent(page, request, "e2e-profile-everywhere");
  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign out everywhere?" });
  await dialog.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login(\?callbackUrl=%2Fprofile)?$/);
});

test("profile: delete the account after re-entering the password", async ({ page, request }) => {
  const email = await newStudent(page, request, "e2e-profile-delete");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await dialog.getByLabel("Password").fill("not my password");
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "That password is not right." }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Password")).toBeFocused();

  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("in one place");
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Sign in" }),
  ).toBeVisible();

  await page.goto("/today");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(formError(page)).toHaveText("Invalid email or password");
});

test("profile: no focused control hides under the phone's bottom tabs", async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(!isMobile, "The bottom tabs exist on phones only.");
  await newStudent(page, request, "e2e-profile-obscured");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await obscuredByBottomTabs(page, 60)).toEqual([]);
});
