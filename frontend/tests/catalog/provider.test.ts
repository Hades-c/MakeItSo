import { describe, expect, it, vi } from "vitest";
import { withCatalogDb } from "./db";
import { GET } from "@/app/api/search/route";
import { SearchResponseSchema, SearchResultSchema } from "@/lib/api/search";
import type { Flags } from "@/lib/flags";
import User from "@/models/User";
import type { SessionUser } from "@/server/auth/session";
import { searchCourses } from "@/server/catalog";
import type { SearchContext } from "@/server/search";
import { search } from "@/server/search/providers/courses";

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

withCatalogDb();

const FLAGS: Flags = {
  careers: true,
  events: true,
  alumni: true,
  ai: true,
  rmp: true,
  rmpSummaries: false,
};

const ctx: SearchContext = {
  user: { id: "0123456789abcdef01234567", email: "sam@davidson.edu", name: "Sam" },
  flags: FLAGS,
  isVerifiedDavidson: async () => false,
  now: new Date("2026-09-30T16:00:00Z"),
};

describe("courses search provider (⌘K)", () => {
  it("returns registration-term courses in the lib/api/search.ts shape", async () => {
    const results = await search("csc121", 8, ctx);
    expect(results).toEqual([
      {
        kind: "course",
        id: "202602:CSC 121",
        title: "CSC 121 · Programming & Problem Solving",
        subtitle: expect.stringMatching(/^Spring 2027 · /),
        href: "/courses/202602/CSC-121",
        source: "course-schedule",
      },
    ]);
    for (const result of results) SearchResultSchema.parse(result);
  });

  it("ranks exact codes, then titles; respects the limit", async () => {
    expect((await search("data structures", 8, ctx)).map((r) => r.id)).toEqual(["202602:CSC 221"]);
    const csc = await search("CSC", 3, ctx);
    expect(csc.map((r) => r.id)).toEqual(["202602:CSC 110", "202602:CSC 121", "202602:CSC 221"]);
    expect(await search("no such course anywhere", 8, ctx)).toEqual([]);
  });

  it("uses the registration term at the context's time", async () => {
    const later = { ...ctx, now: new Date("2026-12-20T17:00:00Z") };
    expect((await search("CSC 221", 1, later))[0]?.href).toBe("/courses/202602/CSC-221");
  });
});

describe("GET /api/search with the courses provider", () => {
  it("interleaves course results with the other providers", async () => {
    await searchCourses({}); // warm: the route gives each provider 1.5 s, a cold load may take longer on CI
    const user = await User.create({ name: "Sam", email: "sam@davidson.edu" });
    session.user = { id: user._id.toString(), email: user.email, name: user.name };
    const res = await GET(new Request("http://localhost/api/search?q=csc%20221"));
    expect(res.status).toBe(200);
    const body = SearchResponseSchema.parse(await res.json());
    expect(body.results[0]).toMatchObject({ kind: "course", href: "/courses/202602/CSC-221" });
    session.user = null;
  });
});
