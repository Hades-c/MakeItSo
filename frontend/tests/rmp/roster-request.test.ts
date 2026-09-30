import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RMP_DAVIDSON_SCHOOL_ID } from "@/lib/types/ratings";
import type * as ExternalModule from "@/server/http/external";
import { fetchExternal } from "@/server/http/external";
import { fetchRoster, RMP_GRAPHQL_URL, RosterError, rosterRequestBody } from "@/server/rmp/roster";
import { rosterPage, teacherNode, serveRosterFixtures } from "./fixture-dir";

// Record how the roster job calls fetchExternal (still served from fixtures: no network).
vi.mock("@/server/http/external", async (importOriginal) => {
  const actual = await importOriginal<typeof ExternalModule>();
  return { ...actual, fetchExternal: vi.fn(actual.fetchExternal) };
});

describe("the roster job's upstream calls", () => {
  let fixtures: { cleanup(): void } | null = null;

  beforeEach(() => {
    vi.mocked(fetchExternal).mockClear();
  });

  afterEach(() => {
    fixtures?.cleanup();
    fixtures = null;
  });

  it("is one POST to the RMP GraphQL endpoint through fetchExternal, with no Authorization header", async () => {
    const roster = await fetchRoster();
    expect(roster).toMatchObject({ pages: 1, rejectedOtherSchool: 2, invalid: 0 });
    expect(roster.rows).toHaveLength(31);

    const calls = vi.mocked(fetchExternal).mock.calls;
    expect(calls).toHaveLength(1);
    const [source, url, options] = calls[0]!;
    expect(source).toBe("ratemyprofessors");
    expect(url).toBe(RMP_GRAPHQL_URL);
    expect(url).toBe("https://www.ratemyprofessors.com/graphql");
    expect(options).toMatchObject({ method: "POST", body: rosterRequestBody(null) });
    expect(options?.headers).toBeUndefined();
    expect(JSON.stringify(options)).not.toMatch(/authorization|basic/i);
    expect(JSON.stringify(options?.body)).toContain(RMP_DAVIDSON_SCHOOL_ID);
  });

  it("pages with the previous page's endCursor as `after`", async () => {
    fixtures = serveRosterFixtures([
      {
        file: "page-3.json",
        bodyIncludes: '"after":"c2"',
        body: rosterPage([teacherNode("Third", "Page")]),
      },
      {
        file: "page-2.json",
        bodyIncludes: '"after":"c1"',
        body: rosterPage([teacherNode("Second", "Page")], { hasNextPage: true, endCursor: "c2" }),
      },
      {
        file: "page-1.json",
        body: rosterPage(
          [teacherNode("First", "Page")],
          { hasNextPage: true, endCursor: "c1" },
          { resultCount: 3 },
        ),
      },
    ]);
    const roster = await fetchRoster();
    expect(roster.pages).toBe(3);
    expect(roster.rows.map((row) => row.firstName)).toEqual(["First", "Second", "Third"]);
    const afters = vi
      .mocked(fetchExternal)
      .mock.calls.map(
        ([, , options]) => (options?.body as ReturnType<typeof rosterRequestBody>).variables,
      )
      .map((variables) => ("after" in variables ? variables.after : null));
    expect(afters).toEqual([null, "c1", "c2"]);
  });

  it("fails when RMP claims a next page without a cursor (the roster would be cut short)", async () => {
    for (const endCursor of [null, ""]) {
      fixtures = serveRosterFixtures([
        {
          file: "page.json",
          body: rosterPage([teacherNode("Only", "Page")], { hasNextPage: true, endCursor }),
        },
      ]);
      await expect(fetchRoster()).rejects.toThrow(RosterError);
      await expect(fetchRoster()).rejects.toThrow(/pagination is inconsistent/);
      fixtures.cleanup();
      fixtures = null;
    }
  });

  it("accepts an empty trailing page that still claims a next page", async () => {
    fixtures = serveRosterFixtures([
      {
        file: "page-2.json",
        bodyIncludes: '"after":"c1"',
        body: rosterPage([], { hasNextPage: true, endCursor: null }, { resultCount: 1 }),
      },
      {
        file: "page-1.json",
        body: rosterPage([teacherNode("Only", "Page")], { hasNextPage: true, endCursor: "c1" }),
      },
    ]);
    const roster = await fetchRoster();
    expect(roster.pages).toBe(2);
    expect(roster.rows.map((row) => row.firstName)).toEqual(["Only"]);
  });
});
