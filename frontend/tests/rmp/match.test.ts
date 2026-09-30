import { describe, expect, it } from "vitest";
import type { Instructor } from "@/lib/types/catalog";
import { matchInstructor, type MatchStatus, type RosterTeacher } from "@/server/rmp/match";
import { RMP_OVERRIDES, type RmpOverride } from "@/server/rmp/overrides";
import { rosterCases } from "./helpers";
import { syntheticRoster } from "./roster-fixture";
import { SYNTHETIC_OVERRIDES } from "./synthetic-overrides";

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
  options: {
    roster?: readonly RosterTeacher[];
    overrides?: readonly RmpOverride[];
    homeSubjects?: readonly string[] | null;
  } = {},
) {
  return matchInstructor(person(first, last), options.roster ?? roster, {
    subjects,
    // The synthetic roster's ids: the production table targets real RMP profiles.
    overrides: options.overrides ?? SYNTHETIC_OVERRIDES,
    ...(options.homeSubjects !== undefined ? { homeSubjects: options.homeSubjects } : {}),
  });
}

let nextId = 9_300_000;
const row = (
  firstName: string,
  lastName: string,
  department: string,
  numRatings = 10,
): RosterTeacher => ({ legacyId: nextId++, firstName, lastName, department, numRatings });

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
      // The row's surname, and its whole name read as a (two-word) surname: "Zebulon Gouri Suresh".
      for (const last of [
        teacher.lastName,
        `${teacher.firstName} ${teacher.lastName}`,
        `${teacher.lastName} ${teacher.firstName}`,
      ]) {
        for (const subjects of [[], ["HUM"], ["WRI"], ["BIO"], ["ECO"]]) {
          const result = match("Zebulon", last, subjects);
          expect(result.status, `Zebulon ${last} ${subjects.join("/")}`).toBe("unmatched");
          expect(match("Zebulon", last, subjects, { homeSubjects: ["ECO"] }).status).toBe(
            "unmatched",
          );
        }
      }
    }
  });

  it("a two-word surname is never matched by RMP's first + last words alone", () => {
    expect(match("Zebulon", "Gouri Suresh", ["ECO"]).status).toBe("unmatched");
    expect(match("Zebulon", "Suresh Gouri", ["WRI"]).status).toBe("unmatched");
    // Without its override, the real Shyam Gouri Suresh has no rule-based match either (RMP has no "Shyam").
    expect(match("Shyam", "Gouri Suresh", ["ECO"], { overrides: [] }).status).toBe("unmatched");
    // Two BIO faculty sharing a hyphenated surname; RMP's "Thurtle Schmidt" row answers for neither by rule.
    const thurtle = [
      row("Debbie", "Thurtle-Schmidt", "Biology"),
      row("Thurtle", "Schmidt", "Biology"),
    ];
    expect(match("Bryan", "Thurtle-Schmidt", ["BIO"], { roster: thurtle }).status).toBe(
      "unmatched",
    );
    expect(match("Debbie", "Thurtle-Schmidt", ["BIO"], { roster: thurtle }).teacher?.legacyId).toBe(
      thurtle[0]!.legacyId,
    );
    const garcia = [row("Garcia", "Lopez", "Chemistry")];
    expect(match("Maria", "Garcia Lopez", ["WRI"], { roster: garcia }).status).toBe("unmatched");
    expect(match("Maria", "Garcia Lopez", ["CHE"], { roster: garcia }).status).toBe("unmatched");
  });

  it("standalone given names are not nicknames: Nathan ≠ Nathaniel, Liam ≠ William", () => {
    const physics = [
      row("Nathaniel", "Ward", "Physics"),
      row("William", "Hart", "Physics"),
      row("Leonard", "Kim", "Physics"),
    ];
    expect(match("Nathan", "Ward", ["PHY"], { roster: physics }).status).toBe("unmatched");
    expect(match("Liam", "Hart", ["PHY"], { roster: physics }).status).toBe("unmatched");
    expect(match("Leo", "Kim", ["PHY"], { roster: physics }).status).toBe("unmatched");
    // Real nicknames still match.
    expect(match("Nate", "Ward", ["PHY"], { roster: physics }).status).toBe("matched");
    expect(match("Bill", "Hart", ["PHY"], { roster: physics }).status).toBe("matched");
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

  it("an interdisciplinary section never lets a nickname through to a specific department (WRI, HUM, ...)", () => {
    // Christopher Alexander teaches CHE; RMP's Chris Alexander is Political Science.
    for (const subjects of [
      ["WRI"],
      ["HUM"],
      ["HUM", "WRI"],
      ["INEU"],
      ["DAT"],
      ["SIL"],
      ["GSS"],
      ["CIS"],
      ["LAS"],
      ["XPL"],
      ["IGEN"],
    ]) {
      const first = match("Christopher", "Alexander", subjects);
      expect(first.teacher, subjects.join("/")).toBeNull();
      expect(first).toMatchObject({
        status: "review",
        reason: "no-department-evidence",
        needsHomeSubjects: true,
      });
      // His other sections are CHE: a true conflict.
      expect(match("Christopher", "Alexander", subjects, { homeSubjects: ["CHE"] })).toMatchObject({
        status: "review",
        reason: "department-conflict",
        needsHomeSubjects: false,
      });
      // Other sections that settle nothing (none, or interdisciplinary only) → still review.
      for (const homeSubjects of [null, [], ["WRI", "HUM"]]) {
        expect(match("Christopher", "Alexander", subjects, { homeSubjects }).status).toBe("review");
      }
    }
    // Other sections in Political Science would settle it.
    expect(
      match("Christopher", "Alexander", ["WRI"], { homeSubjects: ["POL"] }).teacher?.legacyId,
    ).toBe(9000023);
  });

  it("uses the instructor's other sections for an all-interdisciplinary course", () => {
    expect(match("Tim", "Chartier", ["WRI"])).toMatchObject({
      status: "review",
      needsHomeSubjects: true,
    });
    expect(
      match("Tim", "Chartier", ["WRI"], { homeSubjects: ["MAT", "WRI"] }).teacher?.legacyId,
    ).toBe(9000025);
    // Graham Bullock's two disjoint profiles: his other sections pick the person (then most ratings).
    expect(match("Graham", "Bullock", ["HUM"]).needsHomeSubjects).toBe(true);
    expect(
      match("Graham", "Bullock", ["HUM"], { homeSubjects: ["ENV", "POL"] }).teacher?.legacyId,
    ).toBe(9000030);
    // Exact names and agreeing departments never need them.
    expect(match("Sharon", "Green", ["HUM"]).needsHomeSubjects).toBe(false);
    expect(match("Onita", "Vaz", ["WRI"])).toMatchObject({
      status: "matched",
      needsHomeSubjects: false,
    });
    // A section with a specific subject is decided by it alone.
    expect(match("Christopher", "Alexander", ["CHE"]).needsHomeSubjects).toBe(false);
    expect(match("Christopher", "Alexander", ["CHE"], { homeSubjects: ["POL"] }).status).toBe(
      "review",
    );
  });

  it("maps Medicine to PBH/BIO and treats unrecognised departments cautiously", () => {
    const medicine = [row("Chris", "Alexander", "Medicine")];
    expect(match("Christopher", "Alexander", ["CHE"], { roster: medicine })).toMatchObject({
      status: "review",
      reason: "department-conflict",
    });
    expect(match("Christopher", "Alexander", ["PBH"], { roster: medicine }).status).toBe("matched");
    const unknown = [row("Chris", "Alexander", "Underwater Basket Weaving")];
    expect(match("Christopher", "Alexander", ["CHE"], { roster: unknown })).toMatchObject({
      status: "review",
      reason: "no-department-evidence",
    });
    // An exact name is accepted whatever the department says.
    const exact = [row("Christopher", "Alexander", "Underwater Basket Weaving")];
    expect(match("Christopher", "Alexander", ["CHE"], { roster: exact }).status).toBe("matched");
  });

  it("catch-all RMP departments (Interdisciplinary/International Studies, Humanities) never conflict", () => {
    const generic = [
      row("Bradley", "Johnson", "Interdisciplinary Studies", 7),
      row("Katie", "Horowitz", "Interdisciplinary Studies", 17),
      row("Rebecca", "Joubin", "International Studies", 14),
      row("Anne", "Wills", "Humanities", 36),
      row("Vanessa", "Castañeda", "International Studies", 4),
    ];
    const ids = (first: string, last: string, subjects: string[]) =>
      match(first, last, subjects, { roster: generic }).teacher?.legacyId;
    expect(ids("Brad", "Johnson", ["ENV"])).toBe(generic[0]!.legacyId);
    expect(ids("Brad", "Johnson", ["ENV", "POL"])).toBe(generic[0]!.legacyId);
    expect(ids("Katherine", "Horowitz", ["COM", "GSS"])).toBe(generic[1]!.legacyId);
    expect(ids("Katherine", "Horowitz", ["WRI"])).toBe(generic[1]!.legacyId);
    expect(ids("Becky", "Joubin", ["ARB"])).toBe(generic[2]!.legacyId);
    expect(ids("Anne", "Wills", ["REL"])).toBe(generic[3]!.legacyId);
    expect(ids("Vanessa", "Castaneda", ["LAS", "AFR"])).toBe(generic[4]!.legacyId);
    // Still no nickname match without any subject.
    expect(match("Brad", "Johnson", [], { roster: generic }).status).toBe("review");
    // One person's generic profile never hides a conflicting profile of the same name.
    const both = [
      row("Chris", "Alexander", "Interdisciplinary Studies", 3),
      row("Chris", "Alexander", "Political Science", 10),
    ];
    expect(match("Christopher", "Alexander", ["CHE"], { roster: both })).toMatchObject({
      status: "review",
      reason: "department-conflict",
    });
  });

  it("judges one person on their strongest name: the same answer in every course", () => {
    // Real 202601 case: Maggie McCarthy teaches FMS 220 (FMS/COM/FMD/GSS) and GER 302; RMP has both forms.
    const mccarthy = [
      row("Maggie", "McCarthy", "German", 5),
      row("Margaret", "McCarthy", "German", 13),
    ];
    for (const subjects of [["FMS", "COM", "FMD", "GSS"], ["GER"], ["FMD", "GER"], ["WRI"]]) {
      expect(
        match("Maggie", "McCarthy", subjects, { roster: mccarthy }).teacher?.legacyId,
        subjects.join("/"),
      ).toBe(mccarthy[1]!.legacyId);
    }
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

  it("resolves names no rule can know (Lengxob → Lenny Yong; Shyam Gouri Suresh → Suresh Gouri)", () => {
    const yong = match("Lengxob", "Yong", ["BIO"]);
    expect(yong).toMatchObject({ status: "matched", reason: "override" });
    expect(yong.teacher?.legacyId).toBe(9000026);
    expect(match("Lengxob", "Yong", ["BIO"], { overrides: [] }).status).toBe("unmatched");
    // Both Gouri Suresh profiles exist; the override names the primary one, in any subject.
    for (const subjects of [["ECO"], ["SOU"], ["WRI"]]) {
      expect(match("Shyam", "Gouri Suresh", subjects).teacher?.legacyId).toBe(9000018);
    }
  });

  it("the production table points at real profiles, absent from the synthetic roster → unmatched", () => {
    expect(match("Lengxob", "Yong", ["BIO"], { overrides: RMP_OVERRIDES })).toMatchObject({
      status: "unmatched",
      reason: "override-missing",
    });
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
