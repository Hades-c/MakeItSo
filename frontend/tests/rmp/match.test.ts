import { describe, expect, it } from "vitest";
import type { Instructor } from "@/lib/types/catalog";
import { matchInstructor, type MatchStatus, type RosterTeacher } from "@/server/rmp/match";
import type { RmpOverride } from "@/server/rmp/overrides";
import { rosterCases } from "./helpers";
import { syntheticRoster } from "./roster-fixture";

const roster = syntheticRoster();
const person = (first: string, last: string, isStaff = false): Instructor => ({
  first,
  last,
  isStaff,
});

function match(
  first: string,
  last: string,
  subjects: string[],
  options: { roster?: readonly RosterTeacher[]; overrides?: readonly RmpOverride[] } = {},
) {
  return matchInstructor(person(first, last), options.roster ?? roster, {
    subjects,
    ...(options.overrides ? { overrides: options.overrides } : {}),
  });
}

type Expected = number | Exclude<MatchStatus, "matched">;

/**
 * The synthetic collision roster (tests/fixtures/external/ratemyprofessors/cases.json): each API instructor with
 * the subjects they teach in the course fixtures, and the only acceptable outcome.
 */
const COLLISIONS: [first: string, last: string, subjects: string[], expected: Expected][] = [
  ["Fred", "Smith", ["ECO"], 9000001],
  ["Fred", "Smith", ["PPE"], 9000001],
  ["Kevin", "Smith", ["BIO"], 9000002],
  ["Mark", "Smith", ["PSY"], 9000003],
  // Psychology vs a BIO/INEU section: a true conflict, but first AND last name are exact.
  ["Mark", "Smith", ["BIO", "INEU"], 9000003],
  ["Arianna", "Smith", ["BIO"], 9000004],
  ["Allison", "Smith", ["CLA"], 9000005],
  ["Allison", "Smith", ["WRI"], 9000005],
  ["Joshua", "Smith", ["COM"], 9000006],
  ["Sharon", "Green", ["THE"], 9000009],
  ["Sharon", "Green", ["HUM", "WRI"], 9000009],
  // RMP's Hilary Green is at another school: rejected at ingest, and never Sharon Green.
  ["Hilary", "Green", ["AFR"], "unmatched"],
  ["Daniel", "Layman", ["PHI"], 9000011],
  ["Sean", "McKeever", ["PHI", "PPE"], 9000012],
  ["Onita", "Vaz", ["ENG"], 9000013],
  ["Onita", "Vaz", ["WRI"], 9000013],
  ["Tara", "Keith", ["MUS"], 9000014],
  ["Rachid", "El Bejjani", ["BIO"], 9000015],
  ["Katie", "St Clair", ["ART"], 9000016],
  ["Katie", "St. Clair", ["ART"], 9000016],
  ["Shyam", "Gouri Suresh", ["ECO"], 9000018],
  ["Shyam", "Gouri Suresh", ["SOU"], 9000018],
  ["Andrew", "O'Geen", ["POL"], 9000020],
  ["Andrew", "O'Geen", ["HUM", "WRI"], 9000020],
  ["Andrew", "O'Geen", ["ENV", "POL"], 9000020],
  ["Alesha", "Bond", ["PSY"], 9000021],
  ["Anita", "Tripathi", ["THE"], 9000022],
  ["Christopher", "Alexander", ["CHE"], "review"],
  ["Hugh", "Lee", ["POL"], 9000024],
  ["Hugh", "Lee", ["PBH"], 9000024],
  ["Tori", "Lee", ["LAT"], "unmatched"],
  ["Jia Yi", "Lee", ["MUS"], "unmatched"],
  ["Tim", "Chartier", ["MAT"], 9000025],
  ["Tim", "Chartier", ["CSC"], 9000025],
  ["Lengxob", "Yong", ["BIO"], 9000026],
  ["Raghu", "Ramanujan", ["CSC"], 9000027],
  ["Karen", "Hales", ["BIO"], 9000028],
  ["Graham", "Bullock", ["POL"], 9000030],
  ["Sally", "Bullock", ["PBH"], "unmatched"],
  ["LeeAnna", "Chapman", ["ENV"], "unmatched"],
  ["S", "Staff", ["RUS"], "staff"],
];

function outcomeOf(result: ReturnType<typeof match>): Expected {
  return result.status === "matched" ? result.teacher!.legacyId : result.status;
}

describe("matchInstructor: the synthetic collision roster", () => {
  it("keeps only Davidson rows (the fixture's other-school rows are gone)", () => {
    const ids = roster.map((teacher) => teacher.legacyId);
    expect(ids).not.toContain(9000010);
    expect(ids).not.toContain(9000033);
    const davidson = rosterCases().filter((c) => c.davidson);
    expect(ids.sort()).toEqual(davidson.map((c) => c.legacyId).sort());
  });

  it.each(COLLISIONS)("%s %s (%j) → %s", (first, last, subjects, expected) => {
    expect(outcomeOf(match(first, last, subjects))).toBe(expected);
  });

  it("makes zero wrong matches over every case, in any roster order", () => {
    const reversed = [...roster].reverse();
    let wrong = 0;
    for (const [first, last, subjects, expected] of COLLISIONS) {
      for (const order of [roster, reversed]) {
        if (outcomeOf(match(first, last, subjects, { roster: order })) !== expected) wrong++;
      }
    }
    expect(wrong).toBe(0);
  });

  it("uses every Davidson row that has an API instructor, and nothing else", () => {
    const matched = new Set(
      COLLISIONS.map(([first, last, subjects]) => match(first, last, subjects).teacher?.legacyId),
    );
    const notInSchedule = rosterCases()
      .filter((c) => c.davidson && /not in the|distractor|same surname/.test(c.case))
      .map((c) => c.legacyId);
    expect(notInSchedule.sort()).toEqual([9000007, 9000008, 9000032]);
    for (const id of notInSchedule) expect(matched.has(id)).toBe(false);
    // Duplicate B profiles, Sainte-Claire, the swap duplicate and the review-only row are never picked here.
    for (const id of [9000017, 9000019, 9000023, 9000029, 9000031])
      expect(matched.has(id)).toBe(false);
  });
});

describe("never surname-only", () => {
  it("an unrelated first name never matches any roster row, whatever the subject", () => {
    for (const teacher of roster) {
      for (const subjects of [[], ["HUM"], ["BIO"], ["ECO"]]) {
        const result = match("Zebulon", teacher.lastName, subjects);
        expect(result.status, `Zebulon ${teacher.lastName}`).toBe("unmatched");
      }
    }
  });

  it("a prefix is not a nickname: Christina / Timo / Dan never match", () => {
    expect(match("Christina", "Alexander", ["POL"]).status).toBe("unmatched");
    expect(match("Timo", "Chartier", ["MAT"]).status).toBe("unmatched");
    expect(match("Danielle", "Layman", ["PHI"]).status).toBe("unmatched");
  });

  it("Sainte-Claire never answers for St Clair (and vice versa)", () => {
    expect(match("Katie", "Sainte-Claire", ["ART"]).status).toBe("unmatched");
    expect(match("Linsey", "St Clair", ["FRE"]).status).toBe("unmatched");
    expect(match("Linsey", "Sainte-Claire", ["FRE"]).teacher?.legacyId).toBe(9000017);
  });
});

describe("Staff", () => {
  it("is 'staff' without a lookup, flagged or by name", () => {
    expect(matchInstructor(person("S", "Staff", true), roster).status).toBe("staff");
    expect(matchInstructor(person("S", "Staff"), roster).status).toBe("staff");
    expect(matchInstructor(person("", "STAFF"), roster).candidates).toEqual([]);
  });

  it("empty names never match", () => {
    expect(match("", "Smith", ["ECO"]).status).toBe("unmatched");
    expect(match("Fred", "", ["ECO"]).status).toBe("unmatched");
  });
});

describe("departments and ambiguity", () => {
  it("department conflict with a nickname match → review, never auto-matched", () => {
    const result = match("Christopher", "Alexander", ["CHE"]);
    expect(result).toMatchObject({
      status: "review",
      reason: "department-conflict",
      teacher: null,
    });
    expect(result.candidates.map((c) => c.teacher.legacyId)).toEqual([9000023]);
    // The same name where the department agrees is a match: Chris Alexander teaching POL.
    expect(match("Christopher", "Alexander", ["POL"]).teacher?.legacyId).toBe(9000023);
  });

  it("maps departments before calling it a conflict (THE ↔ Fine Arts, CSC ↔ Mathematics)", () => {
    expect(match("Sharon", "Green", ["THE"]).candidates[0]?.department).toBe("agree");
    expect(match("Raghu", "Ramanujan", ["CSC"]).candidates[0]?.department).toBe("agree");
    expect(match("Tim", "Chartier", ["CSC"]).candidates[0]?.department).toBe("agree");
  });

  it("prefers department agreement, then more ratings", () => {
    // Both Karen Hales profiles agree with BIO (Science, Biology): the one with 39 ratings wins.
    expect(match("Karen", "Hales", ["BIO"]).teacher?.legacyId).toBe(9000028);
    // Graham Bullock: Political Science agrees with POL; Environmental Studies with ENV.
    expect(match("Graham", "Bullock", ["POL"]).teacher?.legacyId).toBe(9000030);
    expect(match("Graham", "Bullock", ["ENV"]).teacher?.legacyId).toBe(9000031);
    // Both Gouri Suresh swap profiles are Economics: the primary one (12 ratings) wins.
    expect(match("Shyam", "Gouri Suresh", ["ECO"]).teacher?.legacyId).toBe(9000018);
  });

  it("duplicates in disjoint departments where none agrees → review", () => {
    expect(match("Graham", "Bullock", ["HUM"])).toMatchObject({
      status: "review",
      reason: "ambiguous",
    });
    expect(match("Graham", "Bullock", ["CHE"]).status).toBe("review");
    // Overlapping departments (Science ⊃ Biology) are one person: most ratings.
    expect(match("Karen", "Hales", ["HUM"]).teacher?.legacyId).toBe(9000028);
  });

  it("an initial matching two different people → review; one person → match", () => {
    expect(match("J", "Smith", ["COM"])).toMatchObject({ status: "review", reason: "ambiguous" });
    expect(match("K.", "Hales", ["BIO"]).teacher?.legacyId).toBe(9000028);
    // An initial is weak: without department agreement it needs a person.
    expect(match("K.", "Hales", ["HUM"])).toMatchObject({ status: "review", reason: "weak-name" });
  });

  it("without any subject only exact names are accepted", () => {
    expect(match("Fred", "Smith", []).teacher?.legacyId).toBe(9000001);
    expect(match("Tim", "Chartier", []).status).toBe("review");
    expect(match("Christopher", "Alexander", []).status).toBe("review");
    expect(match("Onita", "Vaz", []).status).toBe("review");
  });

  it("a classic first/last swap matches like a nickname", () => {
    const withSwap: RosterTeacher[] = [
      ...roster,
      {
        legacyId: 9100001,
        firstName: "Zhang",
        lastName: "Wei",
        department: "Economics",
        numRatings: 3,
      },
    ];
    const result = match("Wei", "Zhang", ["ECO"], { roster: withSwap });
    expect(result.teacher?.legacyId).toBe(9100001);
    expect(result.candidates[0]?.kind).toEqual({ form: "swap" });
    expect(match("Wei", "Zhang", ["CHE"], { roster: withSwap }).status).toBe("review");
  });

  it("ties on ratings fall back to the stronger name match, then the lower legacyId", () => {
    const twins: RosterTeacher[] = [
      {
        legacyId: 9200002,
        firstName: "Timothy",
        lastName: "Chartier",
        department: "Mathematics",
        numRatings: 5,
      },
      {
        legacyId: 9200003,
        firstName: "Tim",
        lastName: "Chartier",
        department: "Mathematics",
        numRatings: 5,
      },
      {
        legacyId: 9200001,
        firstName: "Tim",
        lastName: "Chartier",
        department: "Mathematics",
        numRatings: 5,
      },
    ];
    expect(match("Tim", "Chartier", ["MAT"], { roster: twins }).teacher?.legacyId).toBe(9200001);
  });
});

describe("overrides (server/rmp/overrides.ts)", () => {
  const override = (partial: Partial<RmpOverride> & Pick<RmpOverride, "instructor" | "rmp">) =>
    ({
      note: "test",
      source: "test",
      verifiedAt: "2026-09-30",
      ...partial,
    }) satisfies RmpOverride;

  it("the default table resolves the nickname no table can know (Lengxob → Lenny Yong)", () => {
    const result = match("Lengxob", "Yong", ["BIO"]);
    expect(result).toMatchObject({ status: "matched", reason: "override" });
    expect(result.teacher?.legacyId).toBe(9000026);
    expect(match("Lengxob", "Yong", ["BIO"], { overrides: [] }).status).toBe("unmatched");
  });

  it("an explicit no-match beats an exact name", () => {
    const overrides = [override({ instructor: { first: "Fred", last: "Smith" }, rmp: null })];
    expect(match("Fred", "Smith", ["ECO"], { overrides })).toMatchObject({
      status: "unmatched",
      reason: "override-no-match",
    });
  });

  it("a legacyId override matches whatever the names say; a missing target is unmatched", () => {
    const overrides = [
      override({ instructor: { first: "Freddie", last: "Smythe" }, rmp: { legacyId: 9000001 } }),
      override({ instructor: { first: "Nobody", last: "Here" }, rmp: { legacyId: 12345 } }),
    ];
    expect(match("Freddie", "Smythe", ["ECO"], { overrides }).teacher?.legacyId).toBe(9000001);
    expect(match("Nobody", "Here", [], { overrides })).toMatchObject({
      status: "unmatched",
      reason: "override-missing",
    });
  });

  it("resolves the instructor's name after normalisation and honours subject scopes", () => {
    const overrides = [
      override({
        instructor: { first: "christopher ", last: "ALEXANDER" },
        subjects: ["CHE"],
        rmp: null,
      }),
    ];
    expect(match("Christopher", "Alexander", ["CHE"], { overrides }).reason).toBe(
      "override-no-match",
    );
    expect(match("Christopher", "Alexander", ["POL"], { overrides }).teacher?.legacyId).toBe(
      9000023,
    );
  });

  it("a name override that hits two roster rows needs a person", () => {
    const overrides = [
      override({
        instructor: { first: "K", last: "Hales" },
        rmp: { firstName: "Karen", lastName: "Hales" },
      }),
    ];
    expect(match("K", "Hales", ["BIO"], { overrides })).toMatchObject({
      status: "review",
      reason: "ambiguous",
    });
  });
});
