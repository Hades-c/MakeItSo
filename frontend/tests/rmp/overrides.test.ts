import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { getDb } from "@/server/db";
import { getRatings, syncRoster } from "@/server/rmp";
import { overrideTargets } from "@/server/rmp/match";
import { normalizeName } from "@/server/rmp/normalize";
import type * as OverridesModule from "@/server/rmp/overrides";
import { type RmpOverride, RmpOverrideSchema } from "@/server/rmp/overrides";
import { instructor } from "./helpers";
import { syntheticRoster } from "./roster-fixture";

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

  it("every name-based entry resolves to exactly one row of the fixture roster", () => {
    const roster = syntheticRoster();
    for (const entry of RMP_OVERRIDES) {
      if (entry.rmp && "firstName" in entry.rmp) {
        expect(overrideTargets(entry.rmp, roster), JSON.stringify(entry.instructor)).toHaveLength(
          1,
        );
      }
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
