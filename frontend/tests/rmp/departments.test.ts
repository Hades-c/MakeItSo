import { describe, expect, it } from "vitest";
import {
  classifyDepartment,
  departmentRelation,
  departmentsCompatible,
  departmentSubjects,
  hasSpecificSubject,
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
    ["Medicine", ["BIO", "PBH"]],
    ["Math & Computer Science", ["CSC", "DAT", "MAT"]],
    ["Languages", ["ARB", "CHI", "FRE", "GER", "LNG", "MLNG", "RUS", "SIL", "SPA"]],
    ["Theology", ["REL"]],
    ["International Relations", ["POL"]],
    // Catch-alls and unknowns cover nothing.
    ["Interdisciplinary Studies", []],
    ["International Studies", []],
    ["Humanities", []],
    ["Physical Education", []],
    ["Not Specified", []],
    ["Other", []],
    ["", []],
    ["Underwater Basket Weaving", []],
  ])("%s → %j", (department, subjects) => {
    expect(departmentSubjects(department)).toEqual(subjects);
  });

  it("tells catch-all departments from unrecognised ones", () => {
    for (const generic of [
      "Interdisciplinary Studies",
      "International Studies",
      "Humanities",
      "Not Specified",
      "Other",
      "Physical Education",
      "",
      "  ",
      null,
    ]) {
      expect(classifyDepartment(generic), String(generic)).toEqual({
        kind: "generic",
        subjects: [],
      });
    }
    expect(classifyDepartment("Underwater Basket Weaving")).toEqual({
      kind: "unrecognised",
      subjects: [],
    });
    expect(classifyDepartment("Medicine")).toEqual({ kind: "specific", subjects: ["BIO", "PBH"] });
  });

  it("knows every department name on the real Davidson roster (none is unrecognised)", () => {
    // The department names (only) of the Davidson RMP roster captured on 2026-09-30 (477 profiles).
    const real = [
      "Anthropology",
      "Art",
      "Art History",
      "Biology",
      "Chemistry",
      "Chinese",
      "Classics",
      "Communication",
      "Communications",
      "Computer Science",
      "Economics",
      "Education",
      "English",
      "Environmental Studies",
      "Film",
      "Fine Arts",
      "French",
      "German",
      "History",
      "Humanities",
      "Interdisciplinary Studies",
      "International Studies",
      "Languages",
      "Math & Computer Science",
      "Mathematics",
      "Medicine",
      "Military Science",
      "Music",
      "Not Specified",
      "Philosophy",
      "Physical Education",
      "Physics",
      "Political Science",
      "Psychology",
      "Religion",
      "Russian",
      "Science",
      "Sociology",
      "Spanish",
      "Theater",
      "Theology",
    ];
    for (const department of real) {
      expect(classifyDepartment(department).kind, department).not.toBe("unrecognised");
    }
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
      "Medicine",
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

  it("never conflicts for catch-all or unrecognised departments", () => {
    expect(departmentRelation("", ["CHE"])).toBe("generic");
    expect(departmentRelation("Interdisciplinary Studies", ["ENV", "POL"])).toBe("generic");
    expect(departmentRelation("International Studies", ["ARB"])).toBe("generic");
    expect(departmentRelation("Humanities", ["REL"])).toBe("generic");
    expect(departmentRelation("Underwater Basket Weaving", ["CHE"])).toBe("unrecognised");
  });

  it("has nothing to compare with in an all-interdisciplinary or unknown section: unknown", () => {
    expect(departmentRelation("Political Science", [])).toBe("unknown");
    expect(departmentRelation("Political Science", ["HUM", "WRI"])).toBe("unknown");
    expect(departmentRelation("Economics", ["PPE"])).toBe("unknown");
    expect(departmentRelation("Economics", ["SOU"])).toBe("unknown");
    // Agreement with an interdisciplinary subject still counts.
    expect(departmentRelation("Film", ["FMS"])).toBe("agree");
    expect(departmentRelation("English", ["WRI"])).toBe("agree");
  });

  it("then uses the instructor's other sections (home subjects)", () => {
    expect(departmentRelation("Political Science", ["WRI"], ["CHE"])).toBe("conflict");
    expect(departmentRelation("Political Science", ["WRI"], ["CHE", "POL"])).toBe("agree");
    expect(departmentRelation("Political Science", ["WRI"], ["WRI", "HUM"])).toBe("unknown");
    expect(departmentRelation("Political Science", ["WRI"], [])).toBe("unknown");
    expect(departmentRelation("Political Science", ["WRI"], null)).toBe("unknown");
    expect(departmentRelation("Film", ["WRI"], ["DIG"])).toBe("agree");
    // A section with a specific subject is decided by the section alone.
    expect(departmentRelation("Political Science", ["CHE"], ["POL"])).toBe("conflict");
    expect(departmentRelation("Chemistry", ["CHE"], ["POL"])).toBe("agree");
  });

  it("conflicts only when a specific department covers none of the section's specific subjects", () => {
    expect(departmentRelation("Political Science", ["CHE"])).toBe("conflict");
    expect(departmentRelation("Psychology", ["BIO", "INEU"])).toBe("conflict");
    expect(departmentRelation("Political Science", ["PBH"])).toBe("conflict");
    expect(departmentRelation("Political Science", ["HUM", "CHE"])).toBe("conflict");
    expect(departmentRelation("Medicine", ["CHE"])).toBe("conflict");
  });

  it("hasSpecificSubject", () => {
    expect(hasSpecificSubject(["HUM", "WRI"])).toBe(false);
    expect(hasSpecificSubject([])).toBe(false);
    expect(hasSpecificSubject(["WRI", "che"])).toBe(true);
  });
});

describe("departmentsCompatible (could two RMP profiles be one person?)", () => {
  it("overlapping or unknown departments are compatible", () => {
    expect(departmentsCompatible("Science", "Biology")).toBe(true);
    expect(departmentsCompatible("Mathematics", "Computer Science")).toBe(true);
    expect(departmentsCompatible("Economics", "Economics")).toBe(true);
    expect(departmentsCompatible("", "Chemistry")).toBe(true);
    expect(departmentsCompatible("Interdisciplinary Studies", "Chemistry")).toBe(true);
    expect(departmentsCompatible("Weird Dept", "Weird Dept")).toBe(true);
  });

  it("disjoint departments are not", () => {
    expect(departmentsCompatible("Political Science", "Environmental Studies")).toBe(false);
    expect(departmentsCompatible("Chemistry", "Political Science")).toBe(false);
  });
});
