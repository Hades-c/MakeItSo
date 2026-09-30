import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SYNCED_SOURCE_IDS } from "@/lib/sources";
import { RMP_DAVIDSON_SCHOOL_ID } from "@/lib/types/ratings";
import { FixtureManifestSchema, fixturesRoot, matchRoute } from "@/server/http/fixtures";

const root = fixturesRoot();
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

function manifestOf(sourceId: string) {
  return FixtureManifestSchema.parse(
    JSON.parse(readFileSync(path.join(root, sourceId, "manifest.json"), "utf8")),
  );
}

describe("tests/fixtures/external (PLAN §4.1.10)", () => {
  it("has a valid manifest for every synced source, naming files that exist", () => {
    for (const sourceId of SYNCED_SOURCE_IDS) {
      const manifest = manifestOf(sourceId);
      expect(manifest.source).toBe(sourceId);
      const listed = new Set(manifest.routes.map((route) => route.file));
      for (const file of listed) {
        expect(statSync(path.join(root, sourceId, file)).isFile(), `${sourceId}/${file}`).toBe(
          true,
        );
      }
      // Every data file is served by some route (cases.json documents the synthetic RMP roster).
      const onDisk = readdirSync(path.join(root, sourceId)).filter(
        (name) => !["manifest.json", "cases.json"].includes(name),
      );
      expect(onDisk.filter((name) => !listed.has(name))).toEqual([]);
    }
  });

  it("stays under 6 MB in total", () => {
    const total = filesUnder(root).reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThan(MAX_TOTAL_BYTES);
  });

  it("contains no personal e-mail addresses", () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
    for (const file of filesUnder(root)) {
      const found = readFileSync(file, "utf8").match(email) ?? [];
      const personal = found.filter(
        (address) =>
          address !== "contact@example.edu" && !/^\d[\d-]*@hurthub\.davidson\.edu$/.test(address),
      );
      expect(personal, path.relative(root, file)).toEqual([]);
    }
  });

  it("keeps the RMP roster synthetic: no review text, invented ids, one non-Davidson profile", () => {
    const roster = JSON.parse(
      readFileSync(path.join(root, "ratemyprofessors", "teachers-davidson.json"), "utf8"),
    ) as {
      data: { newSearch: { teachers: { edges: { node: Record<string, unknown> }[] } } };
    };
    const nodes = roster.data.newSearch.teachers.edges.map((edge) => edge.node);
    expect(nodes.length).toBeGreaterThan(20);
    for (const node of nodes) {
      expect(Object.keys(node).sort()).toEqual(
        [
          "__typename",
          "avgDifficulty",
          "avgRating",
          "department",
          "firstName",
          "id",
          "lastName",
          "legacyId",
          "numRatings",
          "school",
          "wouldTakeAgainPercent",
        ].sort(),
      );
      expect(node.legacyId as number).toBeGreaterThanOrEqual(9_000_000);
    }
    const schools = new Set(nodes.map((node) => (node.school as { id: string }).id));
    expect(schools.has(RMP_DAVIDSON_SCHOOL_ID)).toBe(true);
    expect(schools.size).toBe(2);
    // The collision cases of PLAN §5.
    const names = nodes.map((node) => `${String(node.firstName)}|${String(node.lastName)}`);
    for (const name of [
      "Onita|Vaz-Hooper",
      "Tara|Villa Keith",
      "Rachid|El Bejjani",
      "Katie|St Clair",
      "Suresh|Gouri",
      "Gouri|Suresh",
      "Andrew|O''Geen",
      "Chris|Alexander",
      "Alesha |Bond ",
    ]) {
      expect(names).toContain(name);
    }
    expect(names.filter((name) => name.endsWith("|Smith")).length).toBeGreaterThanOrEqual(2);
  });

  it("serves the full registration-season terms and the terms list", () => {
    const read = (file: string) =>
      JSON.parse(readFileSync(path.join(root, "course-schedule", file), "utf8")) as unknown[];
    expect(read("courses-202601.json")).toHaveLength(676);
    expect(read("courses-202602.json")).toHaveLength(485);
    expect(read("courses-202501.json").length).toBeGreaterThanOrEqual(100);
    expect(read("terms.json").length).toBeGreaterThan(200);
  });
});

describe("matchRoute", () => {
  const manifest = FixtureManifestSchema.parse({
    source: "course-schedule",
    description: "test",
    routes: [
      { url: "https://api.davidson.edu/a?x=1&y=*", file: "a.json" },
      { url: "https://api.davidson.edu/b", anyQuery: true, file: "b.json" },
      {
        method: "POST",
        url: "https://api.davidson.edu/graphql",
        bodyIncludes: "needle",
        file: "c.json",
      },
    ],
  });

  it("matches method, origin, path and the exact query set (order-free, * = any value)", () => {
    expect(matchRoute(manifest, "GET", "https://api.davidson.edu/a?y=9&x=1")?.file).toBe("a.json");
    expect(matchRoute(manifest, "GET", "https://api.davidson.edu/a?x=2&y=9")).toBeNull();
    expect(matchRoute(manifest, "GET", "https://api.davidson.edu/a?x=1")).toBeNull();
    expect(matchRoute(manifest, "GET", "https://api.davidson.edu/a?x=1&y=2&z=3")).toBeNull();
    expect(matchRoute(manifest, "POST", "https://api.davidson.edu/a?x=1&y=2")).toBeNull();
    expect(matchRoute(manifest, "GET", "https://other.davidson.edu/a?x=1&y=2")).toBeNull();
    expect(matchRoute(manifest, "GET", "https://api.davidson.edu/b?anything=1")?.file).toBe(
      "b.json",
    );
    expect(
      matchRoute(manifest, "POST", "https://api.davidson.edu/graphql", '{"q":"needle"}')?.file,
    ).toBe("c.json");
    expect(matchRoute(manifest, "POST", "https://api.davidson.edu/graphql", "{}")).toBeNull();
  });
});
