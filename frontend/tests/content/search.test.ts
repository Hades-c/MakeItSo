import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { GET } from "@/app/api/search/route";
import { SearchResponseSchema, SearchResultSchema, type SearchResult } from "@/lib/api/search";
import type { Flags } from "@/lib/flags";
import User from "@/models/User";
import type { SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import type { SearchContext } from "@/server/search";
import { search as alumni } from "@/server/search/providers/alumni";
import { search as careers } from "@/server/search/providers/careers";

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

const ALL_ON: Flags = {
  careers: true,
  events: true,
  alumni: true,
  ai: true,
  rmp: true,
  rmpSummaries: false,
};

function ctx(flags: Partial<Flags> = {}, verified = true) {
  const isVerifiedDavidson = vi.fn(async () => verified);
  const context: SearchContext = {
    user: { id: "0123456789abcdef01234567", email: "sam@davidson.edu", name: "Sam" },
    flags: { ...ALL_ON, ...flags },
    isVerifiedDavidson,
    now: new Date("2026-09-30T16:00:00Z"),
  };
  return { context, isVerifiedDavidson };
}

const valid = (results: SearchResult[]) => {
  for (const result of results) expect(SearchResultSchema.parse(result)).toEqual(result);
  return results;
};

describe("careers search provider", () => {
  it("finds career paths by name, best match first", async () => {
    const results = valid(await careers("data", 8, ctx().context));
    expect(results[0]).toEqual({
      kind: "career",
      id: "data-science",
      title: "Data Science & Analytics",
      subtitle: "Technology",
      href: "/careers/data-science",
    });
    expect((await careers("law", 3, ctx().context))[0]?.id).toBe("law");
    expect((await careers("ux", 3, ctx().context))[0]?.id).toBe("ux-design");
  });

  it("matches words, '&' as 'and', clusters and programs", async () => {
    const { context } = ctx();
    expect((await careers("interaction", 3, context))[0]?.id).toBe("ux-design");
    expect((await careers("data science and analytics", 3, context))[0]?.id).toBe("data-science");
    const health = (await careers("health", 10, context)).map((r) => r.id);
    expect(health.slice(0, 1)).toEqual(["healthcare-administration"]);
    expect(health).toContain("medicine"); // cluster "Health"
    expect((await careers("computer science", 10, context)).map((r) => r.id)).toContain(
      "cybersecurity",
    );
  });

  it("matches short fragments only at a name's start or as whole words", async () => {
    const { context } = ctx();
    const ids = async (q: string) => (await careers(q, 20, context)).map((r) => r.id);
    // "plan" is the My plan page, not "Urban Planning" (short fragments match whole words or the name's start).
    expect(await ids("plan")).toEqual([]);
    expect(await ids("planning")).toEqual(["financial-planning", "architecture-urban-planning"]);
    expect(await ids("bank")).toEqual([]);
    expect(await ids("banking")).toEqual(["investment-banking"]);
    expect(await ids("med")).toEqual(["medicine"]);
    expect(await ids("art")).toContain("arts-museum-curation"); // the Art department, a whole word
  });

  it("respects the limit, the flag and empty queries", async () => {
    expect(await careers("manage", 2, ctx().context)).toHaveLength(2);
    expect(await careers("data", 8, ctx({ careers: false }).context)).toEqual([]);
    expect(await careers("zzzz", 8, ctx().context)).toEqual([]);
    expect(await careers("data", 0, ctx().context)).toEqual([]);
  });
});

describe("alumni search provider", () => {
  it("finds verified alumni by name for verified @davidson.edu viewers", async () => {
    const { context, isVerifiedDavidson } = ctx();
    const results = valid(await alumni("curry", 8, context));
    expect(results).toEqual([
      {
        kind: "alumnus",
        id: "stephen-curry",
        title: "Stephen Curry",
        subtitle: "Class of 2022 · Guard, Golden State Warriors",
        href: "/alumni#stephen-curry",
      },
    ]);
    expect(isVerifiedDavidson).toHaveBeenCalled();
    expect((await alumni("tomas", 8, context))[0]).toMatchObject({
      id: "tomas-quintero",
      subtitle: "Class of 2023",
    });
    expect((await alumni("Qualtrics", 8, context)).map((r) => r.id)).toEqual(["neil-patel"]);
  });

  it("shows a role next to its organization, so a former employer does not read as current", async () => {
    const { context } = ctx();
    const expected = {
      kind: "alumnus",
      id: "stephen-p-macmillan",
      title: "Stephen P. MacMillan",
      subtitle: "Class of 1985 · Retired; former Chairman, President & CEO, Hologic",
      href: "/alumni#stephen-p-macmillan",
    };
    expect(valid(await alumni("macmillan", 8, context))).toEqual([expected]);
    expect(await alumni("hologic", 8, context)).toEqual([expected]);
    // Organization alone when the title is LinkedIn-only.
    expect((await alumni("shames", 8, context))[0]?.subtitle).toBe(
      "Class of 1996 · Publicis Groupe",
    );
  });

  it("never searches or shows fields hidden as 'see LinkedIn'", async () => {
    const { context } = ctx();
    // Max Shackelford's McKinsey role is LinkedIn-only (Sophie Eldridge is held for the owner).
    expect(await alumni("mckinsey", 8, context)).toEqual([]);
    expect(await alumni("goosehead", 8, context)).toEqual([]);
    expect(await alumni("microsoft", 8, context)).toEqual([]);
    expect(await alumni("eldridge", 8, context)).toEqual([]);
  });

  it("returns nothing unless the viewer is verified and the flag is on", async () => {
    const unverified = ctx({}, false);
    expect(await alumni("curry", 8, unverified.context)).toEqual([]);
    const off = ctx({ alumni: false });
    expect(await alumni("curry", 8, off.context)).toEqual([]);
    // The flag is checked first: no verification lookup for a surface that is off.
    expect(off.isVerifiedDavidson).not.toHaveBeenCalled();
    // Alumni lives under Careers (PLAN §9 featureEnabled): Careers off hides Alumni too.
    const careersOff = ctx({ careers: false, alumni: true });
    expect(await alumni("curry", 8, careersOff.context)).toEqual([]);
    expect(careersOff.isVerifiedDavidson).not.toHaveBeenCalled();
    expect(await alumni("curry", 0, ctx().context)).toEqual([]);
  });
});

describe("GET /api/search with the content providers", () => {
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

  const get = (query: string) => GET(new Request(`http://localhost/api/search${query}`));

  async function signIn(email: string, verified: boolean) {
    const user = await User.create({ name: "Sam", email });
    if (verified) {
      await User.collection.updateOne(
        { _id: user._id },
        { $set: { emailVerifiedAt: new Date("2026-09-30T12:00:00Z") } },
      );
    }
    session.user = { id: user._id.toString(), email: user.email, name: user.name };
  }

  async function results(query: string) {
    const res = await get(query);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    return SearchResponseSchema.parse(await res.json()).results;
  }

  it("needs a signed-in user", async () => {
    expect((await get("?q=curry")).status).toBe(401);
  });

  it("returns careers to any signed-in user, alumni only to verified @davidson.edu", async () => {
    await signIn("sam@davidson.edu", false);
    const unverified = await results("?q=sports&limit=20");
    expect(unverified.some((r) => r.kind === "career" && r.id === "sports-management")).toBe(true);
    expect(unverified.some((r) => r.kind === "alumnus")).toBe(false);
    expect((await results("?q=curry")).filter((r) => r.kind === "alumnus")).toEqual([]);
  });

  it("includes alumni for a verified @davidson.edu account", async () => {
    await signIn("sam@davidson.edu", true);
    const found = await results("?q=curry");
    expect(found.filter((r) => r.kind === "alumnus").map((r) => r.id)).toEqual(["stephen-curry"]);
  });

  it("keeps alumni from a verified legacy non-Davidson account", async () => {
    await signIn("legacy@gmail.com", true);
    expect((await results("?q=curry")).filter((r) => r.kind === "alumnus")).toEqual([]);
  });

  it("drops alumni when only FEATURE_CAREERS is off (Alumni needs Careers)", async () => {
    vi.stubEnv("FEATURE_CAREERS", "false");
    vi.stubEnv("FEATURE_ALUMNI", "true");
    await signIn("sam@davidson.edu", true);
    const found = await results("?q=curry&limit=20");
    expect(found.filter((r) => r.kind === "career" || r.kind === "alumnus")).toEqual([]);
    vi.unstubAllEnvs();
    // Both on again: the same verified viewer finds him.
    expect((await results("?q=curry")).filter((r) => r.kind === "alumnus")).toHaveLength(1);
  });

  it("drops flagged-off surfaces", async () => {
    vi.stubEnv("FEATURE_CAREERS", "false");
    vi.stubEnv("FEATURE_ALUMNI", "false");
    await signIn("sam@davidson.edu", true);
    const found = await results("?q=sports&limit=20");
    expect(found.filter((r) => r.kind === "career" || r.kind === "alumnus")).toEqual([]);
  });

  it("validates the query", async () => {
    await signIn("sam@davidson.edu", true);
    expect((await get("?q=data&limit=21")).status).toBe(400);
  });
});
