import type { Session } from "next-auth";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { insertUser, sessionFor, stubAuthEnv } from "./helpers";
import LoginPage from "@/app/(auth)/login/page";
import VerifyPage from "@/app/(auth)/verify/page";
import { callbackPathFrom } from "@/server/auth/pages";
import { isSafeAppPath, safeAppPath } from "@/server/auth/paths";
import { RETURN_PATH_HEADER, requireUser, verifiedOnlyRedirect } from "@/server/auth/session";
import { getDb } from "@/server/db";

const auth = vi.hoisted(() => ({ session: null as Session | null }));
const request = vi.hoisted(() => ({ headers: null as Headers | null }));

vi.mock("next-auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServerSession: async () => auth.session,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  connection: async () => undefined,
}));
// Outside a request, next/headers throws; a test can give requireUser the proxy's header instead.
vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  headers: async () => {
    if (!request.headers) throw new Error("headers() outside a request scope");
    return request.headers;
  },
}));

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

beforeEach(() => stubAuthEnv());

afterEach(async () => {
  auth.session = null;
  request.headers = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

/** The path a Next.js redirect() inside `run` goes to (null when it does not redirect). */
async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (!digest.startsWith("NEXT_REDIRECT")) throw error;
    return digest.split(";")[2] ?? null;
  }
}

/**
 * Open-redirect payloads (review blocker): lib/routes safeCallbackPath checks the raw value for "//" but returns
 * the normalised path, and these normalise to a protocol-relative URL ("//evil.example/…").
 */
const EVIL = [
  "/.//evil.example/phish",
  "/..//evil.example/phish",
  "/a/..//evil.example/phish",
  "/%2e//evil.example/x",
  "/./\\evil.example",
  "/.\\/evil.example",
  "//evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "https://evil.example/x",
  "javascript:alert(1)",
  "/\t/evil.example",
];

describe("same-origin return paths", () => {
  it("never yields a path that leaves the origin", () => {
    for (const value of EVIL) {
      const path = callbackPathFrom(value);
      expect(path, value).toBe("/today");
      expect(isSafeAppPath(path)).toBe(true);
      expect(safeAppPath(value, "")).toBe("");
    }
    expect(isSafeAppPath("//evil.example")).toBe(false);
    expect(isSafeAppPath("/\\evil.example")).toBe(false);
    expect(isSafeAppPath("/plan")).toBe(true);
  });

  it("keeps real app paths, with query and hash", () => {
    expect(callbackPathFrom("/plan?tab=next#webtree")).toBe("/plan?tab=next#webtree");
    expect(callbackPathFrom(["/courses/202602/CSC-221", "/other"])).toBe("/courses/202602/CSC-221");
    expect(callbackPathFrom("http://localhost/alumni")).toBe("/alumni");
    expect(callbackPathFrom("/a/../plan")).toBe("/plan");
    expect(callbackPathFrom("/login")).toBe("/today");
    expect(callbackPathFrom(undefined)).toBe("/today");
  });

  it("/login sends a signed-in visitor to a safe callbackUrl only", async () => {
    const user = await insertUser();
    auth.session = await sessionFor(user);
    const login = (callbackUrl: string) => () =>
      LoginPage({ searchParams: Promise.resolve({ callbackUrl }) });
    for (const value of EVIL) expect(await redirectOf(login(value)), value).toBe("/today");
    expect(await redirectOf(login("/plan?tab=next"))).toBe("/plan?tab=next");
  });

  it("/verify never hands the form an off-site `next`", async () => {
    const user = await insertUser({ raw: { emailVerifiedAt: null } });
    auth.session = await sessionFor(user);
    const nextOf = async (next: string) => {
      const element = (await VerifyPage({
        searchParams: Promise.resolve({ next }),
      })) as ReactElement<{
        next: string;
      }>;
      return element.props.next;
    };
    for (const value of EVIL) expect(await nextOf(value), value).toBe("/today");
    expect(await nextOf("/alumni")).toBe("/alumni");
  });
});

describe("requireUser keeps the destination (review regression: deep links lost it)", () => {
  it("sends signed-out visitors to /login with the page's own path", async () => {
    expect(await redirectOf(() => requireUser({ returnTo: "/plan?tab=next" }))).toBe(
      "/login?callbackUrl=%2Fplan%3Ftab%3Dnext",
    );
    expect(await redirectOf(() => requireUser())).toBe("/login");
    for (const value of EVIL) {
      expect(await redirectOf(() => requireUser({ returnTo: value })), value).toBe("/login");
    }
  });

  it("falls back to the proxy's return-path header (checked the same way)", async () => {
    request.headers = new Headers({ [RETURN_PATH_HEADER]: "/courses/202602/CSC-221" });
    expect(await redirectOf(() => requireUser())).toBe(
      "/login?callbackUrl=%2Fcourses%2F202602%2FCSC-221",
    );
    request.headers = new Headers({ [RETURN_PATH_HEADER]: "/.//evil.example" });
    expect(await redirectOf(() => requireUser())).toBe("/login");
    // /today is where sign-in lands anyway: /login stays clean for the most common case.
    request.headers = new Headers({ [RETURN_PATH_HEADER]: "/today" });
    expect(await redirectOf(() => requireUser())).toBe("/login");
    expect(await redirectOf(() => requireUser({ returnTo: "/today?x=1" }))).toBe(
      "/login?callbackUrl=%2Ftoday%3Fx%3D1",
    );
  });

  it("sends accounts that are not verified Davidson ones to /verify with `next`", async () => {
    const user = await insertUser({ raw: { emailVerifiedAt: null } });
    auth.session = await sessionFor(user);
    expect(
      await redirectOf(() => requireUser({ verifiedDavidson: true, returnTo: "/alumni" })),
    ).toBe("/verify?reason=davidson&next=%2Falumni");
    expect(verifiedOnlyRedirect(null)).toBe("/verify?reason=davidson");
  });
});
