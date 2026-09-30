import { describe, expect, it } from "vitest";
import {
  departmentRelation,
  departmentsCompatible,
  departmentSubjects,
  NEUTRAL_SUBJECTS,
  normalizeDepartment,
} from "@/server/rmp/departments";
import { fixtureTeachings, readFixtureJson, rosterCases } from "./helpers";

describe("RMP department → Davidson subject codes (PLAN §9: map before flagging a conflict)", () => {
  it.each([
    ["Theater", ["DAN", "THE"]],
    ["Theatre", ["DAN", "THE"]],
    ["Fine Arts", ["ART", "DAN", "FMD", "MUS", "THE"]],
    ["Computer Science", ["CSC", "DAT", "MAT"]],
    ["Mathematics", ["CSC", "DAT", "MAT"]],
    ["Science", ["BIO", "CHE", "ENV", "GENO", "IGEN", "INEU", "PHY"]],
    ["Political Science", ["POL"]],
    ["Environmental Studies", ["ENV"]],
    ["Communications", ["COM"]],
    ["Economics", ["ECO"]],
    ["Psychology", ["PSY"]],
    ["Biology", ["BIO", "GENO", "IGEN"]],
    ["Chemistry", ["CHE"]],
    ["Classics", ["CLA", "GRE", "LAT"]],
    ["Latin American Studies", ["LAS"]],
    ["South Asian Studies", ["SOU"]],
    ["East Asian Studies", ["CHI", "EAS"]],
    ["English", ["ENG", "LIT", "WRI"]],
    ["Art", ["ART"]],
    ["Art History", ["ART", "HIS"]],
    ["Health Science", ["PBH"]],
    ["Physical Education", []],
    ["Not Specified", []],
    ["", []],
    ["Underwater Basket Weaving", []],
  ])("%s → %j", (department, subjects) => {
    expect(departmentSubjects(department)).toEqual(subjects);
  });

  it("normalises case, accents, ampersands and punctuation", () => {
    expect(normalizeDepartment("  Film & Media — Studies ")).toBe("film and media studies");
    expect(departmentSubjects("MATHEMATICS")).toEqual(departmentSubjects("mathematics"));
    expect(departmentSubjects(null)).toEqual([]);
  });

  it("maps every department of the synthetic roster (no silent unknowns in the fixtures)", () => {
    for (const { department } of rosterCases()) {
      expect(departmentSubjects(department).length, department).toBeGreaterThan(0);
    }
  });

  it("only uses subject codes the course API uses (filters, subjects, cross-listings, cross-postings)", () => {
    const known = new Set<string>();
    for (const term of ["202601", "202602"]) {
      const filters = readFixtureJson("course-schedule", `filters-${term}.json`) as {
        departments: { code: string }[];
      };
      for (const { code } of filters.departments) known.add(code);
      for (const { subjects } of fixtureTeachings(term as "202601" | "202602")) {
        for (const subject of subjects) known.add(subject);
      }
    }
    const probe = [
      "Science",
      "Fine Arts",
      "Languages",
      "Social Sciences",
      "Neuroscience",
      "Computer Science",
      "Africana Studies",
      "Gender Studies",
      "Religion",
      "Russian",
      "Sociology",
      "Anthropology",
      "Dance",
      "Education",
      "Linguistics",
      "Military Science",
      "South Asian Studies",
      "Humanities",
      "Interdisciplinary Studies",
      "Film",
      "Data Science",
      "German",
      "French",
      "Spanish",
      "Chinese",
      "Arabic",
      "Physics",
      "Philosophy",
      "History",
      "Music",
    ];
    for (const department of probe) {
      const subjects = departmentSubjects(department);
      expect(subjects.length, department).toBeGreaterThan(0);
      for (const subject of subjects)
        expect(known.has(subject), `${department} → ${subject}`).toBe(true);
    }
    for (const subject of NEUTRAL_SUBJECTS) expect(known.has(subject), subject).toBe(true);
  });
});

describe("departmentRelation", () => {
  it("agrees through the mapping (THE ↔ Fine Arts, CSC ↔ Mathematics, BIO ↔ Science)", () => {
    expect(departmentRelation("Fine Arts", ["THE"])).toBe("agree");
    expect(departmentRelation("Theater", ["THE"])).toBe("agree");
    expect(departmentRelation("Mathematics", ["CSC"])).toBe("agree");
    expect(departmentRelation("Computer Science", ["MAT"])).toBe("agree");
    expect(departmentRelation("Science", ["BIO"])).toBe("agree");
    // Any of the section's subjects counts: the subject, cross-listed siblings and cross-postings.
    expect(departmentRelation("Political Science", ["ENV", "POL"])).toBe("agree");
  });

  it("is neutral for unknown departments, unknown subjects and interdisciplinary programs", () => {
    expect(departmentRelation("", ["CHE"])).toBe("neutral");
    expect(departmentRelation("Underwater Basket Weaving", ["CHE"])).toBe("neutral");
    expect(departmentRelation("Political Science", [])).toBe("neutral");
    expect(departmentRelation("Political Science", ["HUM", "WRI"])).toBe("neutral");
    expect(departmentRelation("Economics", ["PPE"])).toBe("neutral");
    expect(departmentRelation("Economics", ["SOU"])).toBe("neutral");
  });

  it("conflicts only when a known department covers none of the section's specific subjects", () => {
    expect(departmentRelation("Political Science", ["CHE"])).toBe("conflict");
    expect(departmentRelation("Psychology", ["BIO", "INEU"])).toBe("conflict");
    expect(departmentRelation("Political Science", ["PBH"])).toBe("conflict");
    expect(departmentRelation("Political Science", ["HUM", "CHE"])).toBe("conflict");
  });
});

describe("departmentsCompatible (could two RMP profiles be one person?)", () => {
  it("overlapping or unknown departments are compatible", () => {
    expect(departmentsCompatible("Science", "Biology")).toBe(true);
    expect(departmentsCompatible("Mathematics", "Computer Science")).toBe(true);
    expect(departmentsCompatible("Economics", "Economics")).toBe(true);
    expect(departmentsCompatible("", "Chemistry")).toBe(true);
    expect(departmentsCompatible("Weird Dept", "Weird Dept")).toBe(true);
  });

  it("disjoint departments are not", () => {
    expect(departmentsCompatible("Political Science", "Environmental Studies")).toBe(false);
    expect(departmentsCompatible("Chemistry", "Political Science")).toBe(false);
  });
});
