import { describe, expect, it } from "vitest";
import type { ProgramOfferingKind } from "@/lib/types/catalog";
import {
  kindPreference,
  matchProgramName,
  offeringName,
  programKey,
  subjectOf,
} from "@/server/programs/names";

describe("programKey", () => {
  it.each([
    ["French & Francophone Studies", "french francophone studies"],
    ["French and Francophone Studies", "french francophone studies"],
    ["  french,  FRANCOPHONE studies. ", "french francophone studies"],
    ["Genomics, Bioinformatics", "genomics bioinformatics"],
    ["Genomics & Bioinformatics", "genomics bioinformatics"],
    ["Latin American, Latinx, and Caribbean Studies", "latin american latinx caribbean studies"],
    ["Études Françaises", "etudes francaises"],
    ["Major in Computer Science (B.S. Degree)", "major in computer science b s degree"],
    ["&&&", ""],
  ])("%j → %j", (input, key) => {
    expect(programKey(input)).toBe(key);
  });
});

describe("offering names and subjects", () => {
  it("builds official names with the degree for majors that name one", () => {
    expect(offeringName("Major", "Computer Science", "B.S.")).toBe(
      "Major in Computer Science (B.S. Degree)",
    );
    expect(offeringName("Interdisciplinary Minor", "Data Science", null)).toBe(
      "Interdisciplinary Minor in Data Science",
    );
  });

  it.each([
    ["Major in Economics (A.B. Degree)", "Economics"],
    [
      "Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)",
      "Environmental Studies",
    ],
    ["Interdisciplinary Minor in Latin American Studies", "Latin American Studies"],
    ["Computer Science Major", "Computer Science"],
    ["economics minor", "economics"],
    ["Economics", "Economics"],
  ])("subjectOf(%j) = %j", (name, subject) => {
    expect(subjectOf(name)).toBe(subject);
  });

  it("prefers minors when the text says minor, else majors", () => {
    expect(kindPreference("Economics minor")[0]).toBe("minor");
    expect(kindPreference("Economics")[0]).toBe("major");
    expect(kindPreference("Concentration in X")[0]).toBe("concentration");
  });
});

type Offering = { kind: ProgramOfferingKind; name: string };
const programs: { name: string; offerings: Offering[] }[] = [
  {
    name: "Economics",
    offerings: [
      { kind: "major", name: "Major in Economics (A.B. Degree)" },
      { kind: "minor", name: "Minor in Economics" },
    ],
  },
  {
    name: "French and Francophone Studies",
    offerings: [
      { kind: "major", name: "Major in French and Francophone Studies (A.B. Degree)" },
      { kind: "minor", name: "Minor in French and Francophone Studies" },
    ],
  },
  {
    name: "Genomics & Bioinformatics",
    offerings: [
      { kind: "major", name: "Major in Bioinformatics (B.S. Degree)" },
      { kind: "major", name: "Major in Genomics (B.S. Degree)" },
      { kind: "interdisciplinary-minor", name: "Interdisciplinary Minor in Genomics" },
    ],
  },
  {
    name: "Classics",
    offerings: [
      { kind: "major", name: "Major in Classical Languages and Literature (A.B. Degree)" },
      { kind: "major", name: "Major in Classical Studies (A.B. Degree)" },
      { kind: "minor", name: "Minor in Classical Studies" },
    ],
  },
  {
    name: "Data Science",
    offerings: [
      { kind: "interdisciplinary-minor", name: "Interdisciplinary Minor in Data Science" },
    ],
  },
  { name: "Humanities", offerings: [] },
];

function match(input: string, kinds?: ProgramOfferingKind[]) {
  return matchProgramName(programs, input, kinds)?.offering.name ?? null;
}

describe("matchProgramName", () => {
  it("matches official names whatever the spelling of '&'/'and', punctuation or case", () => {
    expect(match("Major in Economics (A.B. Degree)")).toBe("Major in Economics (A.B. Degree)");
    expect(match("major in french & francophone studies (a.b. degree)")).toBe(
      "Major in French and Francophone Studies (A.B. Degree)",
    );
    expect(match("Minor in French, Francophone Studies")).toBe(
      "Minor in French and Francophone Studies",
    );
  });

  it("maps a bare subject to the major, and to the minor when the text says so", () => {
    expect(match("Economics")).toBe("Major in Economics (A.B. Degree)");
    expect(match("French & Francophone Studies")).toBe(
      "Major in French and Francophone Studies (A.B. Degree)",
    );
    expect(match("Economics minor")).toBe("Minor in Economics");
    expect(match("Minor in economics")).toBe("Minor in Economics");
    expect(match("Classical Studies")).toBe("Major in Classical Studies (A.B. Degree)");
    expect(match("Genomics")).toBe("Major in Genomics (B.S. Degree)");
    expect(match("Data Science")).toBe("Interdisciplinary Minor in Data Science");
  });

  it("restricts candidates to the requested kinds", () => {
    expect(match("Economics", ["minor", "interdisciplinary-minor"])).toBe("Minor in Economics");
    expect(match("Genomics", ["minor", "interdisciplinary-minor"])).toBe(
      "Interdisciplinary Minor in Genomics",
    );
    expect(match("Data Science", ["major"])).toBeNull();
  });

  it("resolves a department page only when it has one offering of the preferred kind", () => {
    expect(match("Genomics, Bioinformatics")).toBeNull(); // two majors: ambiguous, never a guess
    expect(match("Genomics & Bioinformatics minor")).toBe("Interdisciplinary Minor in Genomics");
    expect(match("Classics")).toBeNull();
    expect(match("Classics minor")).toBe("Minor in Classical Studies");
  });

  it("returns null for unknown, empty and offering-less names", () => {
    expect(match("Interdisciplinary Studies")).toBeNull();
    expect(match("Humanities")).toBeNull();
    expect(match("   ")).toBeNull();
    expect(match("Undecided")).toBeNull();
  });
});
