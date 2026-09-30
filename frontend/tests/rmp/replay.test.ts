import { describe, expect, it } from "vitest";
import { matchInstructor, type MatchStatus } from "@/server/rmp/match";
import { normalizeName } from "@/server/rmp/normalize";
import { fixtureTeachings } from "./helpers";
import { syntheticRoster } from "./roster-fixture";

/**
 * Replay of the REAL instructor name list (Fall 2026 + Spring 2027 course API snapshots) against the synthetic
 * roster: every instructor of every section, with that section's subjects. The roster only holds the collision
 * cases (33 rows), so coverage is low by design; what matters is that every match is the intended one and that
 * each instructor gets the same answer in every section they teach. Counts are printed for the W2 report.
 */

/** The only acceptable non-"unmatched" outcome per instructor ("First Last" as the API sends it). */
const EXPECTED: Readonly<Record<string, number | "review" | "staff">> = {
  "Fred Smith": 9000001,
  "Kevin Smith": 9000002,
  "Mark Smith": 9000003,
  "Arianna Smith": 9000004,
  "Allison Smith": 9000005,
  "Joshua Smith": 9000006,
  "Sharon Green": 9000009,
  "Daniel Layman": 9000011,
  "Sean McKeever": 9000012,
  "Onita Vaz": 9000013,
  "Tara Keith": 9000014,
  "Rachid El Bejjani": 9000015,
  "Katie St Clair": 9000016,
  "Shyam Gouri Suresh": 9000018,
  "Andrew O'Geen": 9000020,
  "Alesha Bond": 9000021,
  "Anita Tripathi": 9000022,
  "Christopher Alexander": "review",
  "Hugh Lee": 9000024,
  "Tim Chartier": 9000025,
  "Lengxob Yong": 9000026,
  "Raghu Ramanujan": 9000027,
  "Karen Hales": 9000028,
  "Graham Bullock": 9000030,
  "S Staff": "staff",
};

type Outcome = number | MatchStatus;

type Term = "202501" | "202502" | "202601" | "202602";

function replay(terms: readonly Term[]) {
  const roster = syntheticRoster();
  const byInstructor = new Map<string, Set<Outcome>>();
  let pairs = 0;
  for (const term of terms) {
    for (const { instructor, subjects } of fixtureTeachings(term)) {
      pairs++;
      const result = matchInstructor(instructor, roster, { subjects });
      const name = `${instructor.first} ${instructor.last}`;
      const outcome: Outcome =
        result.status === "matched" ? result.teacher!.legacyId : result.status;
      let outcomes = byInstructor.get(name);
      if (!outcomes) byInstructor.set(name, (outcomes = new Set()));
      outcomes.add(outcome);
    }
  }
  return { byInstructor, pairs };
}

function nonUnmatched(byInstructor: ReadonlyMap<string, ReadonlySet<Outcome>>) {
  return Object.fromEntries(
    [...byInstructor]
      .map(([name, outcomes]) => [name, [...outcomes][0]!] as const)
      .filter(([, outcome]) => outcome !== "unmatched"),
  );
}

function expectedFor(byInstructor: ReadonlyMap<string, unknown>) {
  return Object.fromEntries(Object.entries(EXPECTED).filter(([name]) => byInstructor.has(name)));
}

describe("replay of the 202601 + 202602 instructor lists", () => {
  const { byInstructor, pairs } = replay(["202601", "202602"]);

  it("gives every instructor one answer across all the sections they teach", () => {
    const inconsistent = [...byInstructor].filter(([, outcomes]) => outcomes.size > 1);
    expect(inconsistent).toEqual([]);
  });

  it("matches only the intended profiles: zero wrong matches, zero unexpected matches", () => {
    expect(nonUnmatched(byInstructor)).toEqual(expectedFor(byInstructor));
    // Kevin Smith and Daniel Layman teach only in the 202501/202502 subsets.
    expect(
      Object.keys(EXPECTED)
        .filter((name) => !byInstructor.has(name))
        .sort(),
    ).toEqual(["Daniel Layman", "Kevin Smith"]);
  });

  it("also holds for the 202501/202502 subsets (the other collision instructors)", () => {
    const older = replay(["202501", "202502"]).byInstructor;
    expect([...older].filter(([, outcomes]) => outcomes.size > 1)).toEqual([]);
    expect(nonUnmatched(older)).toEqual(expectedFor(older));
    expect(older.has("Kevin Smith") && older.has("Daniel Layman")).toBe(true);
  });

  it("reports coverage (counts only)", () => {
    const counts = { matched: 0, review: 0, staff: 0, unmatched: 0 };
    for (const outcomes of byInstructor.values()) {
      const outcome = [...outcomes][0]!;
      counts[typeof outcome === "number" ? "matched" : (outcome as keyof typeof counts)]++;
    }
    const distinct = new Set([...byInstructor.keys()].map((name) => normalizeName(name))).size;
    console.log(
      `[rmp replay] ${pairs} instructor-section pairs, ${byInstructor.size} distinct instructors ` +
        `(${distinct} after normalisation): ${counts.matched} matched, ${counts.review} review, ` +
        `${counts.staff} staff, ${counts.unmatched} unmatched against the ${syntheticRoster().length}-row ` +
        `synthetic roster`,
    );
    expect(counts).toEqual({ matched: 21, review: 1, staff: 1, unmatched: 220 });
    expect(byInstructor.size).toBe(243);
    expect(distinct).toBe(byInstructor.size);
  });

  it("covers both terms", () => {
    for (const term of ["202601", "202602"] as const) {
      const { byInstructor: one } = replay([term]);
      expect(one.size).toBeGreaterThan(200);
    }
  });
});
