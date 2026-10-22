import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { GET } from "@/app/api/search/route";
import { SearchResponseSchema, type SearchResult } from "@/lib/api/search";
import type { Flags } from "@/lib/flags";
import User from "@/models/User";
import type { SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { MissingFixtureError } from "@/server/http/fixtures";
import {
  interleave,
  matchStrength,
  search,
  type SearchContext,
  type SearchProvider,
} from "@/server/search";
import { search as pages } from "@/server/search/providers/pages";

const session = vi.hoisted(() => ({ user: null as SessionUser | null }));

vi.mock("@/server/auth/session", async () => {
  const { ApiError } = await import("@/server/http/errors");
  return {
    requireApiUser: async () => {
      if (!session.user) throw new ApiError(401, "unauthorized", "Sign in to continue.");
      return session.user;
    },
  };
});

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  session.user = null;
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const ALL_ON: Flags = {
  careers: true,
  events: true,
  alumni: true,
  ai: true,
  rmp: true,
  rmpSummaries: false,
};

function ctx(flags: Partial<Flags> = {}): SearchContext {
  return {
    user: { id: "0123456789abcdef01234567", email: "sam@davidson.edu", name: "Sam" },
    flags: { ...ALL_ON, ...flags },
    isVerifiedDavidson: async () => false,
    now: new Date("2026-09-30T14:00:00Z"),
  };
}

const result = (kind: SearchResult["kind"], id: string): SearchResult => ({
  kind,
  id,
  title: id,
  href: `/${id}`,
});

describe("search aggregator", () => {
  it("interleaves providers round-robin, dedupes and caps at the limit", () => {
    const merged = interleave(
      [
        [result("course", "a"), result("course", "b"), result("course", "c")],
        [result("career", "x")],
        [result("course", "a"), result("page", "p")],
      ],
      4,
    );
    expect(merged.map((r) => r.id)).toEqual(["a", "x", "b", "p"]);
  });

  it("tiers titles by how they match the query: exact, whole words, prefix, inside, other", () => {
    expect(matchStrength("CSC 221 · Data Structures", "csc 221")).toBe("exact");
    expect(matchStrength("CSC 221 · Data Structures", "Data  Structures")).toBe("exact");
    expect(matchStrength("Today", "TODAY")).toBe("exact");
    expect(matchStrength("My plan", "plan")).toBe("words");
    expect(matchStrength("Stephen Curry", "curry")).toBe("words");
    expect(matchStrength("Tomás Pérez", "tomas")).toBe("words");
    expect(matchStrength("Law & Policy", "law and policy")).toBe("exact");
    expect(matchStrength("Architecture & Urban Planning", "plan")).toBe("prefix");
    expect(matchStrength("CSC 221 · Data Structures", "csc 2")).toBe("prefix");
    expect(matchStrength("Transplant Biology", "plan")).toBe("inside");
    expect(matchStrength("ECO 101 · Introductory Economics", "dan")).toBe("other");
    expect(matchStrength("anything", "   ")).toBe("other");
  });

  it("merges by match strength, then round-robin in provider order within a strength", () => {
    const titled = (kind: SearchResult["kind"], id: string, title: string): SearchResult => ({
      kind,
      id,
      title,
      href: `/${id}`,
    });
    const lists = [
      [
        titled("course", "c1", "URB 210 · Urban Planning"),
        titled("course", "c2", "ECO 101 · Micro"),
      ],
      [titled("career", "k1", "Planning Ahead")],
      [titled("page", "p1", "My plan"), titled("page", "p2", "4-year plan")],
    ];
    expect(interleave(lists, 10, "plan").map((r) => r.id)).toEqual(["p1", "p2", "c1", "k1", "c2"]);
    expect(interleave(lists, 3, "plan").map((r) => r.id)).toEqual(["p1", "p2", "c1"]);
    // Without a query: plain round-robin.
    expect(interleave(lists, 10).map((r) => r.id)).toEqual(["c1", "k1", "p1", "c2", "p2"]);
  });

  it("skips failing and slow providers, but never hides a missing fixture", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ok: SearchProvider = async () => [result("page", "ok")];
    const broken: SearchProvider = async () => {
      throw new Error("boom");
    };
    expect(
      await search("x", 5, ctx(), [
        ["broken", broken],
        ["ok", ok],
      ]),
    ).toEqual([result("page", "ok")]);
    expect(log).toHaveBeenCalled();

    const missing: SearchProvider = async () => {
      throw new MissingFixtureError("wildcatsync", "GET", "https://wildcatsync.davidson.edu/x");
    };
    await expect(search("x", 5, ctx(), [["missing", missing]])).rejects.toBeInstanceOf(
      MissingFixtureError,
    );
  });

  it("returns nothing for a blank query", async () => {
    expect(await search("   ", 8, ctx())).toEqual([]);
  });

  it("finds pages, respecting flags", async () => {
    const plan = await pages("plan", 8, ctx());
    expect(plan[0]).toEqual({
      kind: "page",
      id: "plan",
      title: "My plan",
      subtitle: "Next semester, 4-year plan and summer",
      href: "/plan",
    });
    expect((await pages("webtree", 8, ctx())).map((r) => r.href)).toEqual(["/plan?tab=next"]);
    expect(await pages("careers", 8, ctx({ careers: false }))).toEqual([]);
    // Hub sections follow the shell (server/features.ts): Alumni also needs Careers.
    expect((await pages("alumni", 8, ctx())).map((r) => r.href)).toEqual(["/alumni"]);
    expect(await pages("alumni", 8, ctx({ alumni: false }))).toEqual([]);
    expect(await pages("alumni", 8, ctx({ careers: false }))).toEqual([]);
    expect(await pages("events", 8, ctx({ events: false }))).toEqual([]);
    expect((await pages("suggest", 8, ctx({ ai: false }))).map((r) => r.id)).toEqual([]);
    for (const r of await pages("e", 20, ctx())) {
      expect(r.href.startsWith("/")).toBe(true);
    }
  });
});

describe("GET /api/search", () => {
  const get = (query: string) => GET(new Request(`http://localhost/api/search${query}`));

  async function signIn() {
    const user = await User.create({ name: "Sam", email: "sam@davidson.edu" });
    session.user = { id: user._id.toString(), email: user.email, name: user.name };
  }

  it("needs a signed-in user", async () => {
    expect((await get("?q=plan")).status).toBe(401);
  });

  it("answers the frozen contract, never cached", async () => {
    await signIn();
    const res = await get("?q=plan&limit=3");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = SearchResponseSchema.parse(await res.json());
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.length).toBeLessThanOrEqual(3);
    expect(body.results[0]).toMatchObject({ kind: "page", href: "/plan" });

    expect(await (await get("?q=%20%20")).json()).toEqual({ results: [] });
    expect(await (await get("")).json()).toEqual({ results: [] });
  });

  it("rejects a limit above 20", async () => {
    await signIn();
    const res = await get("?q=plan&limit=50");
    expect(res.status).toBe(400);
  });

  it("hides the sections the shell hides (Alumni with Careers)", async () => {
    await signIn();
    const hrefs = async (q: string) =>
      SearchResponseSchema.parse(await (await get(`?q=${q}`)).json()).results.map((r) => r.href);
    vi.stubEnv("FEATURE_CAREERS", "false");
    expect(await hrefs("alumni")).not.toContain("/alumni");
    vi.stubEnv("FEATURE_CAREERS", "true");
    expect(await hrefs("alumni")).toContain("/alumni");
  });

  it("fails with a 500 on a malformed flag, like every route (PLAN §2)", async () => {
    // Only the shell and the flagged pages fall back (server/features.ts loadFlags); the palette then lists its
    // own pages.
    await signIn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("FEATURE_EVENTS", "sometimes");
    const res = await get("?q=events");
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalled();
  });
});
