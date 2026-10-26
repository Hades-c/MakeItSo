import type { Session } from "next-auth";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, sessionFor, stubAuthEnv } from "./helpers";
import VerifyPage from "@/app/(auth)/verify/page";
import { getDb } from "@/server/db";

/**
 * /verify without a mail provider (as in production until one is set up), in each state of the temporary
 * AI_ALLOW_UNVERIFIED switch and of AI itself: the page offers AI in the meantime only while AI works without a
 * verified address (server/ai/access.ts aiOpenWithoutVerifying), like the landing's AI claim.
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

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => {
  stubAuthEnv();
  vi.stubEnv("MAIL_PROVIDER", "none");
});

afterEach(async () => {
  auth.session = null;
  vi.unstubAllEnvs();
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

async function renderVerify(): Promise<string> {
  const page = await VerifyPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(createElement("div", null, page));
}

describe("/verify while no mail provider is configured", () => {
  beforeEach(async () => {
    const user = await insertUser({
      email: "casey@davidson.edu",
      raw: { emailVerifiedAt: null },
    });
    auth.session = await sessionFor(user);
  });

  it("switch off: the alumni network and AI need a verified address", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const html = await renderVerify();
    expect(html).toContain("Email verification is not available yet.");
    expect(html).toContain("the alumni network and AI features need a verified @davidson.edu");
  });

  it("switch on and AI working: AI in the meantime, except cold-email drafts", async () => {
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "true");
    vi.stubEnv("AI_PROVIDER", "mock");
    const html = await renderVerify();
    expect(html).toContain("with an @davidson.edu account, the AI features in the meantime");
  });

  it("switch on but AI off or not set up: no AI in the meantime, the switch's rule all the same", async () => {
    vi.stubEnv("AI_ALLOW_UNVERIFIED", "true");
    // No provider configured (vitest sets no key).
    let html = await renderVerify();
    expect(html).not.toContain("AI features in the meantime");
    expect(html).toContain(
      "You can use the catalog and your plan in the meantime; the alumni network and cold-email drafts need a verified @davidson.edu account.",
    );
    vi.stubEnv("AI_PROVIDER", "mock");
    vi.stubEnv("AI_ENABLED", "false");
    html = await renderVerify();
    expect(html).not.toContain("AI features in the meantime");
    expect(html).toContain("You can use the catalog and your plan in the meantime;");
  });
});
