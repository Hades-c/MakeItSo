import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { getDb } from "@/server/db";
import { getRatings, syncRoster } from "@/server/rmp";
import { overrideTargets } from "@/server/rmp/match";
import { normalizeName } from "@/server/rmp/normalize";
import type * as OverridesModule from "@/server/rmp/overrides";
import { type RmpOverride, RmpOverrideSchema } from "@/server/rmp/overrides";
import { FIXTURE_TERMS, fixtureTeachings, instructor } from "./helpers";
import { syntheticRoster } from "./roster-fixture";
import { SYNTHETIC_OVERRIDES } from "./synthetic-overrides";

// getRatings reads RMP_OVERRIDES: replace the table with test entries (plus the real ones).
const table = vi.hoisted(() => ({ extra: [] as RmpOverride[] }));
vi.mock("@/server/rmp/overrides", async (importOriginal) => {
  const actual = await importOriginal<typeof OverridesModule>();
  return {
    ...actual,
    get RMP_OVERRIDES() {
      return [...table.extra, ...actual.RMP_OVERRIDES];
    },
  };
});

const { RMP_OVERRIDES } = await import("@/server/rmp/overrides");

describe("the override table", () => {
  it("is valid, sourced, dated and has one entry per instructor and subject scope", () => {
    const keys = new Set<string>();
    for (const entry of RMP_OVERRIDES) {
      const parsed = RmpOverrideSchema.parse(entry);
      expect(parsed.verifiedAt <= "2026-09-30").toBe(true);
      const key = `${normalizeName(entry.instructor.first)}|${normalizeName(entry.instructor.last)}|${entry.subjects?.join(",") ?? "*"}`;
      expect(keys.has(key), key).toBe(false);
      keys.add(key);
    }
  });

  it("targets real RMP profiles by legacyId (or none), citing each profile and the course API", () => {
    expect(RMP_OVERRIDES.length).toBeGreaterThan(0);
    for (const entry of RMP_OVERRIDES) {
      const label = `${entry.instructor.first} ${entry.instructor.last}`;
      expect(entry.rmp === null || "legacyId" in entry.rmp, label).toBe(true);
      if (entry.rmp && "legacyId" in entry.rmp) {
        // Real ids, never the synthetic fixture's 9xxxxxx range.
        expect(entry.rmp.legacyId, label).toBeLessThan(9_000_000);
        expect(entry.source, label).toContain(
          `https://www.ratemyprofessors.com/professor/${entry.rmp.legacyId} `,
        );
      }
      expect(entry.source, label).toContain("Davidson course API");
      expect(entry.source, label).not.toMatch(/tests\/fixtures|cases\.json|synthetic/i);
    }
  });

  it("keys every entry on a name form the course API really sends", () => {
    const names = new Set<string>();
    for (const term of FIXTURE_TERMS) {
      for (const { instructor: who } of fixtureTeachings(term))
        names.add(`${who.first}|${who.last}`);
    }
    for (const entry of RMP_OVERRIDES) {
      const key = `${entry.instructor.first}|${entry.instructor.last}`;
      expect(names.has(key), key).toBe(true);
    }
  });

  it("the synthetic test table resolves each entry to exactly one fixture row", () => {
    const roster = syntheticRoster();
    for (const entry of SYNTHETIC_OVERRIDES) {
      RmpOverrideSchema.parse(entry);
      expect(entry.rmp && overrideTargets(entry.rmp, roster), JSON.stringify(entry)).toHaveLength(
        1,
      );
    }
  });

  it("rejects malformed entries", () => {
    const base = {
      instructor: { first: "A", last: "B" },
      rmp: null,
      note: "n",
      source: "s",
      verifiedAt: "2026-09-30",
    };
    expect(RmpOverrideSchema.safeParse(base).success).toBe(true);
    expect(RmpOverrideSchema.safeParse({ ...base, rmp: { legacyId: -1 } }).success).toBe(false);
    expect(RmpOverrideSchema.safeParse({ ...base, subjects: ["chem"] }).success).toBe(false);
    expect(RmpOverrideSchema.safeParse({ ...base, verifiedAt: "soon" }).success).toBe(false);
    expect(RmpOverrideSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("overrides through getRatings (stored roster)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
    await getDb();
  });

  beforeEach(async () => {
    table.extra = [];
    await testDb.clear();
    await syncRoster();
  });

  afterAll(async () => {
    await testDb.stop();
  });

  const entry = (partial: Pick<RmpOverride, "instructor" | "rmp"> & Partial<RmpOverride>) =>
    RmpOverrideSchema.parse({ note: "test", source: "test", verifiedAt: "2026-09-30", ...partial });

  it("loads a legacyId target even when its name shares nothing with the instructor", async () => {
    table.extra = [
      entry({ instructor: { first: "Jane", last: "Doe-Newname" }, rmp: { legacyId: 9000032 } }),
    ];
    const [jane] = await getRatings([instructor("Jane", "Doe-Newname")], { subject: "MAT" });
    expect(jane).toMatchObject({ status: "matched", rmp: { legacyId: 9000032 } });
  });

  it("an explicit no-match hides a rating the matcher would show", async () => {
    table.extra = [entry({ instructor: { first: "Fred", last: "Smith" }, rmp: null })];
    const [fred, kevin] = await getRatings(
      [instructor("Fred", "Smith"), instructor("Kevin", "Smith")],
      { subject: "ECO", relatedSubjects: ["BIO"] },
    );
    expect(fred?.status).toBe("unmatched");
    expect(kevin?.status).toBe("matched");
  });

  it("resolves a review case once a person confirms the profile", async () => {
    const before = await getRatings([instructor("Christopher", "Alexander")], { subject: "CHE" });
    expect(before[0]?.status).toBe("review");
    table.extra = [
      entry({
        instructor: { first: "Christopher", last: "Alexander" },
        subjects: ["CHE"],
        rmp: null,
      }),
    ];
    const after = await getRatings([instructor("Christopher", "Alexander")], { subject: "CHE" });
    expect(after[0]?.status).toBe("unmatched");
  });
});
