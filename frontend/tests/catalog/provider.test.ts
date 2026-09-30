import { describe, expect, it, vi } from "vitest";
import { setNow, withCatalogDb } from "./db";
import { GET } from "@/app/api/search/route";
import { SearchResponseSchema, SearchResultSchema } from "@/lib/api/search";
import type { Flags } from "@/lib/flags";
import User from "@/models/User";
import type { SessionUser } from "@/server/auth/session";
import { countCourses, resolveTerms, searchCourses } from "@/server/catalog";
import { browseTerm } from "@/server/catalog/read";
import { refreshTerm, setIngestDepsForTests } from "@/server/catalog/refresh";
import { fetchSectionsPage, type FetchSectionsPage } from "@/server/catalog/upstream";
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

  it("falls back to the current term while the registration term is unpublished (late January)", async () => {
    // 2027-02-01: current Spring 2027, registration Fall 2027, whose schedule upstream answers with [] for weeks.
    setNow("2027-02-01T10:00:00-05:00");
    const fetchPage: FetchSectionsPage = async (term, offset, options) =>
      term === "202701" ? [] : fetchSectionsPage(term, offset, options);
    setIngestDepsForTests({ fetchPage });
    const february = { ...ctx, now: new Date("2027-02-01T15:00:00Z") };
    const results = await search("csc 121", 8, february);
    expect(results.map((r) => [r.id, r.href, r.subtitle?.split(" · ")[0]])).toEqual([
      ["202602:CSC 121", "/courses/202602/CSC-121", "Spring 2027"],
    ]);
    const resolved = await resolveTerms();
    expect(resolved).toMatchObject({ current: "202602", registration: "202701" });
    expect(await browseTerm(resolved)).toBe("202602");
    expect(await countCourses("202701")).toBe(0);
    // Once Fall 2027 is published, the palette moves to it.
    setIngestDepsForTests({
      fetchPage: async (term, offset, options) =>
        fetchSectionsPage(term === "202701" ? "202602" : term, offset, options).then((items) =>
          (items as Record<string, unknown>[]).map((item) => ({
            ...item,
            term: { code: Number(term) },
          })),
        ),
    });
    await refreshTerm("202701", { hot: true });
    expect(await browseTerm(await resolveTerms())).toBe("202701");
    expect((await search("csc 121", 8, february))[0]?.id).toBe("202701:CSC 121");
  });

  it("titles a topics course neutrally and names the matching topic in the subtitle", async () => {
    const [wri] = await search("religion public square", 8, ctx);
    expect(wri).toMatchObject({
      id: "202602:WRI 101",
      title: "WRI 101 · Writing Program: topics vary by section",
      subtitle: expect.stringMatching(/^Spring 2027 · Religion in the Public Square/),
    });
    const [code] = await search("WRI 101", 8, ctx);
    expect(code?.subtitle).not.toContain("Religion");
  });

  it("finds people by name however the apostrophe is typed", async () => {
    const straight = await search("O'Keefe", 8, ctx);
    expect(straight.length).toBeGreaterThan(0);
    expect(await search("O\u2019Keefe", 8, ctx)).toEqual(straight);
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
