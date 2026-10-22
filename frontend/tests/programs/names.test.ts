import { describe, expect, it } from "vitest";
import type { ProgramOfferingKind } from "@/lib/types/catalog";
import {
  matchProgramName,
  offeringName,
  parseNameQuery,
  programKey,
  subjectKey,
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
    ["Major in Economics (A.B. Degree)", "economics"],
    [
      "Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)",
      "environmental studies",
    ],
    ["Interdisciplinary Minor in Latin American Studies", "latin american studies"],
    ["Major in Philosophy, Politics, and Economics", "philosophy politics economics"],
    ["Computer Science Major", "computer science"],
    ["economics minor", "economics"],
    ["Economics", "economics"],
    ["Russian Studies Major Requirements", "russian studies"],
  ])("subjectKey(%j) = %j", (name, subject) => {
    expect(subjectKey(name)).toBe(subject);
  });

  it.each([
    ["Economics (minor)", "economics", "minor"],
    ["Minor: Economics", "economics", "minor"],
    ["Major - Computer Science", "computer science", "major"],
    ["Computer Science (B.S.)", "computer science", null],
    ["Computer Science, B.S.", "computer science", null],
    ["B.S. in Computer Science", "computer science", null],
    ["BS Computer Science", "computer science", null],
    ["Environmental Studies (B.A.)", "environmental studies", null],
    ["Computer Science (B.S. Degree) Major", "computer science", "major"],
    ["Concentration in Film", "film", "concentration"],
    ["Minors in Greek", "greek", "minor"],
  ] as const)("parseNameQuery(%j) → subject %j, kind %j", (input, subject, family) => {
    expect(parseNameQuery(input)).toMatchObject({ subject, family, conflicting: false });
  });

  it("notices when the text names two kinds", () => {
    expect(parseNameQuery("Economics major and minor")).toMatchObject({
      subject: "economics",
      family: null,
      conflicting: true,
    });
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
  {
    name: "Physics",
    offerings: [
      { kind: "major", name: "Major in Physics (B.S. Degree)" },
      { kind: "minor", name: "Minor in Applied Physics" },
      { kind: "minor", name: "Minor in Astrophysics" },
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
    expect(match("Data Science minor")).toBe("Interdisciplinary Minor in Data Science");
  });

  it("tolerates punctuation around the kind and degree words", () => {
    expect(match("Economics (minor)")).toBe("Minor in Economics");
    expect(match("Minor: Economics")).toBe("Minor in Economics");
    expect(match("Major - Economics")).toBe("Major in Economics (A.B. Degree)");
    expect(match("Economics (A.B.)")).toBe("Major in Economics (A.B. Degree)");
    expect(match("Economics, A.B.")).toBe("Major in Economics (A.B. Degree)");
    expect(match("A.B. in Economics")).toBe("Major in Economics (A.B. Degree)");
    expect(match("french and francophone studies (major)")).toBe(
      "Major in French and Francophone Studies (A.B. Degree)",
    );
  });

  it("treats a kind named in the text as a constraint, never falling back to another kind", () => {
    expect(match("Physics minor")).toBeNull();
    expect(match("Minor in Physics")).toBeNull();
    expect(match("Economics major", ["minor", "interdisciplinary-minor"])).toBeNull();
    expect(match("Minor in Economics", ["major"])).toBeNull();
    expect(match("Major in Economics (A.B. Degree)", ["minor"])).toBeNull();
    expect(match("Data Science major")).toBeNull();
    expect(match("Economics major and minor")).toBeNull();
  });

  it("restricts candidates to the requested kinds", () => {
    expect(match("Economics", ["minor", "interdisciplinary-minor"])).toBe("Minor in Economics");
    expect(match("Genomics", ["minor", "interdisciplinary-minor"])).toBe(
      "Interdisciplinary Minor in Genomics",
    );
    expect(match("Data Science", ["major"])).toBeNull();
  });

  it("resolves a department page only when it has one offering of the kind asked for", () => {
    expect(match("Genomics, Bioinformatics")).toBeNull(); // two majors: ambiguous, never a guess
    expect(match("Genomics & Bioinformatics minor")).toBe("Interdisciplinary Minor in Genomics");
    expect(match("Classics")).toBeNull();
    expect(match("Classics minor")).toBe("Minor in Classical Studies");
    expect(match("Physics minor")).toBeNull(); // Applied Physics and Astrophysics
  });

  it("returns null for unknown, empty and offering-less names", () => {
    expect(match("Interdisciplinary Studies")).toBeNull();
    expect(match("Humanities")).toBeNull();
    expect(match("   ")).toBeNull();
    expect(match("Undecided")).toBeNull();
    expect(match("Minor")).toBeNull();
    expect(match("B.S.")).toBeNull();
  });
});
