import { describe, expect, it } from "vitest";
import { matchInstructor, type MatchStatus } from "@/server/rmp/match";
import { normalizeName } from "@/server/rmp/normalize";
import {
  FIXTURE_TERMS,
  type FixtureTerm,
  fixtureTeachings,
  homeSubjectsByInstructor,
  homeSubjectsOf,
} from "./helpers";
import { syntheticRoster } from "./roster-fixture";
import { SYNTHETIC_OVERRIDES } from "./synthetic-overrides";

/**
 * Replay of the REAL instructor name lists (every course-schedule snapshot: full 202601 + 202602, subsets back to
 * 202201) against the SYNTHETIC collision roster: every instructor of every section, with that section's
 * subjects, matched the way getRatings does it (a second pass with the instructor's other sections in the term
 * when the first one asks for them). The synthetic roster only holds the collision cases (31 Davidson rows), so
 * this is a wrong-match check, not a coverage measure: every match must be the intended one, and each instructor
 * must get the same answer in every section they teach. Real-roster coverage: tests/rmp/audit-roster.test.ts.
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
  // "Not in the current schedule" (cases.json): listed only in an older subset.
  "Tabitha Peck": 9000032,
  "S Staff": "staff",
};

type Outcome = number | MatchStatus;

function replay(terms: readonly FixtureTerm[], options: { homeSubjects?: boolean } = {}) {
  const roster = syntheticRoster();
  const byInstructor = new Map<string, Set<Outcome>>();
  let pairs = 0;
  for (const term of terms) {
    const teachings = fixtureTeachings(term);
    const home = homeSubjectsByInstructor(teachings);
    for (const { instructor, subjects } of teachings) {
      pairs++;
      const context = { subjects, overrides: SYNTHETIC_OVERRIDES };
      let result = matchInstructor(instructor, roster, context);
      if (result.needsHomeSubjects && options.homeSubjects !== false) {
        result = matchInstructor(instructor, roster, {
          ...context,
          homeSubjects: homeSubjectsOf(home, instructor),
        });
      }
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

function inconsistent(byInstructor: ReadonlyMap<string, ReadonlySet<Outcome>>) {
  return [...byInstructor].filter(([, outcomes]) => outcomes.size > 1);
}

describe("replay of the real instructor lists against the synthetic roster", () => {
  const { byInstructor, pairs } = replay(["202601", "202602"]);

  it("gives every instructor one answer across all the sections they teach", () => {
    expect(inconsistent(byInstructor)).toEqual([]);
  });

  it("matches only the intended profiles: zero wrong matches, zero unexpected matches", () => {
    expect(nonUnmatched(byInstructor)).toEqual(expectedFor(byInstructor));
    // Kevin Smith, Daniel Layman and Tabitha Peck teach only in the older subsets.
    expect(
      Object.keys(EXPECTED)
        .filter((name) => !byInstructor.has(name))
        .sort(),
    ).toEqual(["Daniel Layman", "Kevin Smith", "Tabitha Peck"]);
  });

  it("holds for every fixture term, with and without the other-sections lookup", () => {
    for (const homeSubjects of [true, false]) {
      const all = replay(FIXTURE_TERMS, { homeSubjects }).byInstructor;
      expect(inconsistent(all)).toEqual([]);
      expect(nonUnmatched(all)).toEqual(expectedFor(all));
      expect(Object.keys(EXPECTED).filter((name) => !all.has(name))).toEqual([]);
    }
  });

  it("never gives Christopher Alexander RMP's Chris Alexander (Political Science), in any section", () => {
    const roster = syntheticRoster();
    let seen = 0;
    for (const term of FIXTURE_TERMS) {
      const teachings = fixtureTeachings(term);
      const home = homeSubjectsByInstructor(teachings);
      for (const { instructor, subjects } of teachings) {
        if (instructor.first !== "Christopher" || instructor.last !== "Alexander") continue;
        seen++;
        // His real sections, and the same sections re-listed under interdisciplinary programs.
        for (const listed of [subjects, ["WRI"], ["HUM"], ["INEU"], ["DAT"], ["SIL"]]) {
          for (const homeSubjects of [undefined, homeSubjectsOf(home, instructor), null]) {
            const result = matchInstructor(instructor, roster, {
              subjects: listed,
              overrides: SYNTHETIC_OVERRIDES,
              ...(homeSubjects !== undefined ? { homeSubjects } : {}),
            });
            expect(result.teacher?.legacyId, `${term} ${listed.join("/")}`).not.toBe(9000023);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("reports outcome counts (synthetic roster: a wrong-match check, not coverage)", () => {
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

  it("covers both full terms", () => {
    for (const term of ["202601", "202602"] as const) {
      const { byInstructor: one } = replay([term]);
      expect(one.size).toBeGreaterThan(200);
    }
  });
});
