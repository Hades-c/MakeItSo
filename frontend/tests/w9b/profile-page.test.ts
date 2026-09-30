import type { Session } from "next-auth";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, sessionFor, stubAuthEnv } from "../w3/helpers";
import ProfilePage, { metadata } from "@/app/(hub)/profile/page";
import { loadProfilePage } from "@/app/(hub)/profile/_lib/load";
import { CAREERS } from "@/server/content/careers";
import { getDb } from "@/server/db";
import { officialProgramNames } from "@/server/programs";

/**
 * /profile against the real session, profile and programs code (in-memory MongoDB, fixtures mode): the loader's
 * data, and the page rendered to HTML with its client islands (server-side render, as Next.js does first).
 */

const auth = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  auth.session = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

async function signIn(raw: Record<string, unknown> = {}, email = "casey@davidson.edu") {
  const user = await insertUser({
    name: "Casey Wildcat",
    email,
    raw: { emailVerifiedAt: null, sessionVersion: 0, graduationYear: 2029, ...raw },
  });
  auth.session = await sessionFor(user);
  return user;
}

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(createElement("div", null, await ProfilePage()));
}

describe("loadProfilePage", () => {
  it("reads the profile, the official names, the career taxonomy and the server's now", async () => {
    const user = await signIn({ majors: ["Major in Economics (A.B. Degree)"], interests: ["law"] });
    const data = await loadProfilePage(user.id);
    expect(data.profile).toMatchObject({
      id: user.id,
      name: "Casey Wildcat",
      email: "casey@davidson.edu",
      davidson: true,
      emailVerifiedAt: null,
      majors: ["Major in Economics (A.B. Degree)"],
      minors: [],
      graduationYear: 2029,
      firstTerm: null,
      standingOverride: null,
      interests: ["law"],
      aiConsentAt: null,
      adultAttestedAt: null,
    });
    expect(data.profile).not.toHaveProperty("standing");
    expect(data.majors).toEqual(await officialProgramNames("major"));
    expect(data.minors).toEqual([
      ...(await officialProgramNames("minor")),
      ...(await officialProgramNames("interdisciplinary-minor")),
    ]);
    expect(data.careers).toEqual(
      CAREERS.map(({ slug, name, cluster }) => ({ slug, name, cluster })),
    );
    expect(data.flags).toEqual({ ai: true });
    expect(data.verifiedDavidson).toBe(false);
    expect(data.now).toBe("2026-09-30T16:00:00.000Z");
  });

  it("knows a verified Davidson account, and the AI flag", async () => {
    vi.stubEnv("AI_ENABLED", "false");
    const user = await signIn({ emailVerifiedAt: new Date("2026-09-29T15:00:00Z") });
    const data = await loadProfilePage(user.id);
    expect(data.verifiedDavidson).toBe(true);
    expect(data.flags.ai).toBe(false);
  });

  it("never counts a verified legacy non-Davidson address as verified Davidson", async () => {
    const user = await signIn(
      { emailVerifiedAt: new Date("2026-09-29T15:00:00Z") },
      "old@gmail.com",
    );
    const data = await loadProfilePage(user.id);
    expect(data.profile.davidson).toBe(false);
    expect(data.verifiedDavidson).toBe(false);
  });
});

describe("ProfilePage", () => {
  it("is titled Profile and sends signed-out visitors to /login, back here after", async () => {
    expect(metadata).toEqual({ title: "Profile" });
    await expect(ProfilePage()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/login\?callbackUrl=%2Fprofile;/),
    });
  });

  it("renders every area for a new, unverified student", async () => {
    await signIn();
    const html = await renderPage();
    expect(html).toContain("<h1");
    for (const [id, title] of [
      ["account", "Account"],
      ["academics", "Academics"],
      ["interests", "Interests"],
      ["ai-features", "AI features"],
      ["security", "Security"],
      ["your-data", "Your data"],
    ]) {
      expect(html).toContain(`<section id="${id}" aria-labelledby="${id}-title"`);
      expect(html).toMatch(new RegExp(`<h2 id="${id}-title"[^>]*>${title}</h2>`));
      expect(html).toContain(`href="#${id}"`);
    }
    expect(html).toContain("casey@davidson.edu");
    expect(html).toContain("Not verified");
    expect(html).toContain('href="/verify?next=%2Fprofile"');
    expect(html).toContain('value="Casey Wildcat"');
    // Academics: the derived standing and the default first term.
    expect(html).toContain("Sophomore (from your graduation year)");
    expect(html).toContain("Not set: MakeItSo assumes Fall 2025.");
    expect(html).toContain("No major chosen.");
    // Interests: every career path is a chip.
    expect(html.match(/aria-pressed="(true|false)"/g)).toHaveLength(CAREERS.length);
    // AI: off, with the notice and the attestation.
    expect(html).toContain("AI features stay off until you turn them on.");
    expect(html).toContain("Anthropic");
    expect(html).toContain(
      "never sends your name, your email address, your account id or any grades",
    );
    expect(html).toContain("I am 18 or older");
    expect(html).toContain("Turn on AI features");
    expect(html).toContain(
      "The alumni network and AI features are limited to verified @davidson.edu accounts.",
    );
    // Security and data.
    expect(html).toContain("Change password");
    expect(html).toContain("Sign out everywhere");
    expect(html).toContain("Download my data");
    expect(html).toContain("Delete account");
  });

  it("shows what a verified student already chose", async () => {
    await signIn({
      emailVerifiedAt: new Date("2026-09-29T15:00:00Z"),
      majors: ["Major in Computer Science (B.S. Degree)"],
      minors: ["Minor in Economics"],
      firstTerm: "202501",
      standingOverride: "junior",
      interests: ["software-engineering", "data-science"],
      adultAttestedAt: new Date("2026-09-29T15:00:00Z"),
      aiConsentAt: new Date("2026-09-29T15:00:00Z"),
    });
    const html = await renderPage();
    expect(html).toContain("Verified");
    expect(html).toContain("on Sep 29, 2026");
    expect(html).not.toContain("Not verified");
    expect(html).toContain("Major in Computer Science (B.S. Degree)");
    expect(html).toContain("Minor in Economics");
    expect(html).toContain("Fall 2025");
    expect(html).toContain("Junior (set by you)");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(html).toContain("You turned AI features on Sep 29, 2026.");
    expect(html).toContain("Turn off AI features");
    expect(html).not.toContain("limited to verified @davidson.edu accounts");
  });
});
