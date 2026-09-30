import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_ORIGIN, formError, registerViaApi, SAME_ORIGIN, signIn, uniqueEmail } from "./helpers";

/**
 * Sign-up, verification, sign-in and account flows (W3). The e2e server runs the console mailer, and
 * GET /api/auth/test-mailbox (fixtures + console mailer only, never on Vercel) hands the tests the codes.
 */

interface MailboxMessage {
  kind: string;
  code: string | null;
}

async function mailbox(request: APIRequestContext, email: string): Promise<MailboxMessage[]> {
  const res = await request.get(`/api/auth/test-mailbox?email=${encodeURIComponent(email)}`);
  expect(res.status()).toBe(200);
  return ((await res.json()) as { messages: MailboxMessage[] }).messages;
}

/** The newest code of `kind` sent to `email` (mail goes out just after the response, so poll briefly). */
async function latestCode(request: APIRequestContext, email: string, kind: string) {
  let code: string | null = null;
  await expect
    .poll(async () => {
      const messages = await mailbox(request, email);
      code = [...messages].reverse().find((m) => m.kind === kind)?.code ?? null;
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code as unknown as string;
}

async function signOutFromMenu(page: Page) {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test("landing page renders with security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("in one place");
  // Truthful copy only: no invented statistics or model claims.
  await expect(page.locator("body")).not.toContainText(/Gemini|Powered by/i);
});

test("signed-out visitors are sent to /login, and old routes redirect", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("register, verify with the e-mailed code, sign out, and sign back in", async ({ page }) => {
  const email = uniqueEmail("e2e-auth");
  const password = "e2e password 123";

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Casey Wildcat");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await expect(page.getByLabel("Class year")).toHaveText("First-year");
  await page.getByRole("button", { name: "Create account" }).click();

  // A new account is signed in straight away and asked for its code.
  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByRole("heading", { level: 1, name: "Verify your email" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const code = await latestCode(page.request, email, "verify-email");
  const wrong = code === "000000" ? "111111" : "000000";
  await page.getByLabel("Verification code").fill(wrong);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  // (After a client navigation Next's route announcer is a non-empty alert too: match the form's own.)
  await expect(page.getByRole("alert").filter({ hasText: "4 attempts left" })).toBeVisible();

  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("day-summary")).toBeVisible();
  await expect(page.getByText("Welcome, Casey.")).toBeVisible();

  const me = await page.request.get("/api/me");
  expect(((await me.json()) as { me: { verifiedDavidson: boolean } }).me.verifiedDavidson).toBe(
    true,
  );

  await page.getByRole("button", { name: /Account menu/ }).click();
  await expect(page.getByTestId("hub-user-email")).toHaveText(email);
  await page.keyboard.press("Escape");
  await signOutFromMenu(page);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(formError(page)).toHaveText("Invalid email or password");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText("Welcome, Casey.")).toBeVisible();
});

test("registering an address that already has an account reveals nothing", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("e2e-dup");
  await registerViaApi(request, { name: "First Person", email, password: "first person pw 1" });

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Second Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("second person pw 2");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your Davidson inbox" })).toBeVisible();
  await expect(formError(page)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/already (exists|registered)/i);

  // Only the owner's inbox learns about it.
  await expect
    .poll(async () => (await mailbox(request, email)).map((m) => m.kind))
    .toEqual(["verify-email", "signup-pending"]);
});

test("new sign-ups need a @davidson.edu address and an uncommon password", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Gmail Person");
  await page.getByLabel("Email").fill("someone@gmail.com");
  await page.getByLabel("Password").fill("1234567890");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use your @davidson.edu email address")).toBeVisible();

  await page.getByLabel("Email").fill(uniqueEmail("e2e-common"));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/commonly used passwords/)).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

test("sign-in honours a same-origin callbackUrl, and signed-in visitors skip the auth pages", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("e2e-callback");
  const password = "callback e2e password";
  await registerViaApi(request, { name: "Cal Back", email, password });

  await page.goto("/login?callbackUrl=%2Fplan%3Ftab%3Dfour-year");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\?tab=four-year$/);

  await page.goto("/login");
  await expect(page).toHaveURL(/\/today$/);
  await page.goto("/register");
  await expect(page).toHaveURL(/\/today$/);

  await signOutFromMenu(page);
  await page.goto("/login?callbackUrl=https%3A%2F%2Fevil.example%2Fsteal");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test("the login page never shows arbitrary text from the URL", async ({ page }) => {
  await page.goto("/login?error=Your%20account%20is%20locked.%20Call%20555-0100");
  await expect(formError(page)).toHaveText("Sign-in failed. Please try again.");
});

test("sign out everywhere revokes the other device's session", async ({ browser, request }) => {
  const email = uniqueEmail("e2e-everywhere");
  const password = "everywhere e2e password";
  await registerViaApi(request, { name: "Two Devices", email, password });
  const laptop = await browser.newContext();
  const phone = await browser.newContext();
  try {
    const laptopPage = await laptop.newPage();
    const phonePage = await phone.newPage();
    await signIn(laptopPage, email, password);
    await signIn(phonePage, email, password);

    const res = await laptopPage.request.delete("/api/account/sessions", { headers: SAME_ORIGIN });
    expect(res.status()).toBe(204);

    await phonePage.goto("/today");
    await expect(phonePage).toHaveURL(/\/login$/);
    await laptopPage.goto("/today");
    await expect(laptopPage).toHaveURL(/\/login$/);
  } finally {
    await laptop.close();
    await phone.close();
  }
});

test("forgot password: reset with an e-mailed code", async ({ page, request }) => {
  const email = uniqueEmail("e2e-reset");
  await registerViaApi(request, { name: "Reset Me", email, password: "old e2e password" });

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset code" }).click();
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

  const code = await latestCode(request, email, "reset-password");
  await page.getByLabel("Reset code").fill(code);
  await page.getByLabel("New password").fill("new e2e password");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/\/today$/);

  await signOutFromMenu(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("old e2e password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(formError(page)).toHaveText("Invalid email or password");
});

test("download my data, then delete the account", async ({ page, request }) => {
  const email = uniqueEmail("e2e-delete");
  const password = "delete e2e password";
  await registerViaApi(request, { name: "Leaving Soon", email, password });
  await signIn(page, email, password);

  const exported = await page.request.get("/api/me/export");
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-disposition"]).toMatch(
    /^attachment; filename="makeitso-data-/,
  );
  const data = (await exported.json()) as { profile: Record<string, unknown>; data: object };
  expect(data.profile.email).toBe(email);
  expect(data.profile).not.toHaveProperty("password");
  expect(Object.keys(data.data)).toEqual(
    expect.arrayContaining(["verificationcodes", "ratelimits"]),
  );

  const wrong = await page.request.delete("/api/me", {
    headers: SAME_ORIGIN,
    data: { password: "not my password" },
  });
  expect(wrong.status()).toBe(400);
  const deleted = await page.request.delete("/api/me", {
    headers: SAME_ORIGIN,
    data: { password },
  });
  expect(deleted.status()).toBe(204);

  await page.goto("/today");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(formError(page)).toHaveText("Invalid email or password");
});

test("the privacy page explains data use, AI and removal", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("link", { name: "what we store and why" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy at MakeItSo" })).toBeVisible();
  await expect(page.locator("main")).toContainText("not a Davidson College service");
  await expect(page.locator("main")).toContainText("Anthropic");
  await expect(page.getByRole("heading", { name: "How long we keep things" })).toBeVisible();
});

test("state-changing API calls from another site are refused", async ({ request }) => {
  const data = { name: "Mallory", email: uniqueEmail("e2e-csrf"), password: "password 12345" };
  const crossSite = await request.post("/api/auth/register", {
    data,
    headers: { origin: "https://evil.example" },
  });
  expect(crossSite.status()).toBe(403);
  const sameSite = await request.post("/api/auth/register", {
    data,
    headers: { origin: E2E_ORIGIN },
  });
  expect(sameSite.status()).toBe(202);
});

test("search answers signed-in users only, with the frozen contract", async ({ page, request }) => {
  const signedOut = await request.get("/api/search?q=plan");
  expect(signedOut.status()).toBe(401);
  expect(signedOut.headers()["cache-control"]).toBe("private, no-store");

  const email = uniqueEmail("e2e-search");
  await registerViaApi(request, { name: "Sky Search", email, password: "search e2e password" });
  await signIn(page, email, "search e2e password");
  const res = await page.request.get("/api/search?q=plan&limit=3");
  expect(res.status()).toBe(200);
  const { results } = (await res.json()) as { results: { kind: string; href: string }[] };
  expect(results[0]).toMatchObject({ kind: "page", href: "/plan" });
});
