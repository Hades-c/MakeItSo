import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQ_CODES, WAYS_OF_KNOWING } from "@/lib/types/catalog";
import { REQUIREMENT_SLOTS } from "@/lib/types/plan";
import {
  CATALOG_YEARS,
  catalogYearForTerm,
  CURRENT_CATALOG_YEAR,
  GRADUATION_RULES,
  graduationRulesFor,
  GraduationRulesSchema,
  REQUIREMENT_CODES,
  requirementName,
  REQUIREMENTS_DISCLAIMER,
  resolveGraduationRules,
  slotForCode,
} from "@/server/content/requirements";

const FIXTURES = new URL("../fixtures/external/course-schedule/", import.meta.url);

interface UpstreamSection {
  subject: { code: string };
  course_number: string;
  grad_requirements: { code: string; description: string }[] | null;
}

const filters = ["filters-202601.json", "filters-202602.json"].map(
  (file) =>
    JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")) as {
      departments: { code: string; description: string }[];
      grad_requirements: { code: string; description: string }[];
    },
);
const sections: UpstreamSection[] = readdirSync(FIXTURES)
  .filter((file) => /^courses-\d{6}\.json$/.test(file))
  .flatMap(
    (file) => JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")) as UpstreamSection[],
  );

const rules = GRADUATION_RULES["2026-2027"]!;

describe("requirement codes", () => {
  it("describes every Banner code with the label the course API sends", () => {
    expect(Object.keys(REQUIREMENT_CODES).sort()).toEqual([...REQ_CODES].sort());
    const apiLabels = new Map<string, string>();
    for (const f of filters)
      for (const r of f.grad_requirements) apiLabels.set(r.code, r.description);
    for (const s of sections) {
      for (const r of s.grad_requirements ?? []) apiLabels.set(r.code, r.description);
    }
    for (const info of Object.values(REQUIREMENT_CODES)) {
      expect([info.code, info.apiLabel]).toEqual([info.code, apiLabels.get(info.code)]);
      expect(info.sources.length).toBeGreaterThan(0);
    }
  });

  it("maps each code to at most one tracker slot, and each course slot to exactly one code", () => {
    for (const slot of REQUIREMENT_SLOTS.filter((s) => s !== "PE")) {
      const codes = REQ_CODES.filter((code) => slotForCode(code) === slot);
      expect([slot, codes]).toEqual([slot, [slot]]);
    }
    expect(slotForCode("NONE")).toBeNull();
    expect(slotForCode("NSCI")).toBeNull();
    expect(REQUIREMENT_CODES.NSCI.kind).toBe("legacy");
    expect(REQUIREMENT_CODES.NONE.kind).toBe("none");
    for (const code of WAYS_OF_KNOWING)
      expect(REQUIREMENT_CODES[code].kind).toBe("ways-of-knowing");
  });

  it("uses the official names from the Academic Regulations", () => {
    expect(requirementName("LTRQ")).toBe("Literary Studies, Creative Writing, and Rhetoric");
    expect(requirementName("MQRQ")).toBe("Mathematical and Quantitative Thought");
    expect(requirementName("PRRQ")).toBe("Philosophical and Religious Perspectives");
    expect(requirementName("JEC")).toBe("Justice, Equality, and Community");
    expect(requirementName("COMP")).toBe("Writing (Composition)");
  });
});

describe("graduation rules", () => {
  it("validates every edition and keys it by catalog year", () => {
    expect(CATALOG_YEARS).toEqual(["2025-2026", "2026-2027"]);
    expect(CURRENT_CATALOG_YEAR).toBe("2026-2027");
    for (const [year, edition] of Object.entries(GRADUATION_RULES)) {
      expect(GraduationRulesSchema.parse(edition)).toEqual(edition);
      expect(edition.catalogYear).toBe(year);
      expect(edition.verifiedAt).toBe("2026-09-30");
      // Every rule cites the edition's own regulations document.
      for (const rule of [
        edition.credits,
        edition.writing,
        edition.waysOfKnowing,
        edition.culturalDiversity,
        edition.justiceEqualityCommunity,
        edition.language,
        edition.physicalEducation,
        edition.passFail,
        edition.preMatriculation,
        edition.major,
        edition.minor,
      ]) {
        expect(rule.source.url).toBe(edition.sources[0]);
        expect(rule.text.length).toBeGreaterThan(20);
      }
    }
    expect(REQUIREMENTS_DISCLAIMER).toBe("Unofficial — verify in Degree Works");
  });

  it("requires 32 credits with half in residence, including the final seven", () => {
    expect(rules.credits).toMatchObject({
      required: 32,
      residenceFraction: 0.5,
      residenceFinalCourses: 7,
    });
  });

  it("fills Writing only with WRI 101 or HUM 104, by the end of the first year, never AP", () => {
    expect(rules.writing).toMatchObject({
      courses: ["WRI 101", "HUM 104"],
      completeBy: "end-of-first-year",
      preMatriculationCounts: false,
    });
    // The course data agrees: COMP is on WRI 101 and HUM 104 sections only.
    const compCourses = new Set(
      sections
        .filter((s) => s.grad_requirements?.some((r) => r.code === "COMP"))
        .map((s) => `${s.subject.code} ${s.course_number}`),
    );
    expect([...compCourses].sort()).toEqual(["HUM 104", "WRI 101"]);
  });

  it("has seven Ways of Knowing, one slot per course, lab science, two pre-matriculation credits", () => {
    expect(rules.waysOfKnowing.slots.map((s) => s.code)).toEqual([...WAYS_OF_KNOWING]);
    expect(rules.waysOfKnowing.slots.filter((s) => s.laboratory).map((s) => s.code)).toEqual([
      "NSRQ",
    ]);
    expect(rules.waysOfKnowing).toMatchObject({
      coursesRequired: 7,
      maxSlotsPerCourse: 1,
      preMatriculationMaxCredits: 2,
      mayAlsoFill: ["CULT", "JEC"],
    });
    for (const slot of rules.waysOfKnowing.slots)
      expect(slot.name).toBe(requirementName(slot.code));
    expect(rules.preMatriculation).toMatchObject({ maxCredits: 4, waysOfKnowingMaxCredits: 2 });
  });

  it("asks one CULT and one JEC course, either may overlap a Way of Knowing", () => {
    expect(rules.culturalDiversity).toMatchObject({
      coursesRequired: 1,
      mayOverlapWaysOfKnowing: true,
    });
    expect(rules.justiceEqualityCommunity).toMatchObject({
      coursesRequired: 1,
      mayOverlapWaysOfKnowing: true,
    });
  });

  it("sets the language rule: 201+ in the eight Davidson languages, never SIL, with exemptions", () => {
    const subjects = rules.language.languages.map((l) => l.subject);
    expect(subjects).toEqual(["GRE", "ARB", "CHI", "FRE", "GER", "LAT", "RUS", "SPA"]);
    expect(rules.language.minCourseNumber).toBe(201);
    expect(rules.language.excludedSubjects.map((s) => s.subject)).toEqual(["SIL"]);
    expect(rules.language.alternatives).toHaveLength(3);
    // Every language and SIL is a real subject; every FRLG section is a 201+ course in one of the eight.
    const departments = new Set(filters.flatMap((f) => f.departments.map((d) => d.code)));
    for (const subject of [...subjects, "SIL"]) expect(departments.has(subject)).toBe(true);
    const frlg = sections.filter((s) => s.grad_requirements?.some((r) => r.code === "FRLG"));
    expect(frlg.length).toBeGreaterThan(0);
    for (const s of frlg) {
      expect(subjects).toContain(s.subject.code);
      expect(Number.parseInt(s.course_number, 10)).toBeGreaterThanOrEqual(201);
    }
  });

  it("asks 2 Lifetime Activity + 1 Team Sport PE credits, outside the course data", () => {
    expect(rules.physicalEducation).toMatchObject({
      slot: "PE",
      lifetimeActivity: 2,
      teamSport: 1,
      creditBearing: false,
      inCourseApi: false,
    });
  });

  it("limits elected Pass/Fail to three, one per semester, none for the major", () => {
    expect(rules.passFail).toMatchObject({
      maxElected: 3,
      maxPerSemester: 1,
      passMinimumGrade: "C-",
      satisfiesMajorMinor: false,
    });
    expect(rules.major.minGpa).toBe(2);
    expect(rules.minor.declareBy).toBe("October 1 of the senior year");
  });

  it("keeps the 2025-26 and 2026-27 editions identical apart from their sources", () => {
    const strip = (edition: (typeof GRADUATION_RULES)[string]) =>
      JSON.parse(
        JSON.stringify(edition, (key, value: unknown) =>
          key === "url" || key === "sources" || key === "catalogYear" || key === "title"
            ? undefined
            : value,
        ),
      ) as unknown;
    expect(strip(GRADUATION_RULES["2025-2026"]!)).toEqual(strip(rules));
    expect(GRADUATION_RULES["2025-2026"]!.sources[0]).not.toBe(rules.sources[0]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(rules.waysOfKnowing.slots)).toBe(true);
    expect(Object.isFrozen(REQUIREMENT_CODES)).toBe(true);
  });
});

describe("choosing the rules for a student", () => {
  it("maps a term to its catalog year", () => {
    expect(catalogYearForTerm("202601")).toBe("2026-2027");
    expect(catalogYearForTerm("202602")).toBe("2026-2027");
    expect(catalogYearForTerm("202603")).toBe("2026-2027");
    expect(catalogYearForTerm("202501")).toBe("2025-2026");
    expect(catalogYearForTerm("000001")).toBeNull();
    expect(catalogYearForTerm("2026")).toBeNull();
  });

  it("uses the exact edition, else the nearest verified one (flagged)", () => {
    expect(resolveGraduationRules("2026-2027")).toEqual({ rules, exact: true });
    expect(resolveGraduationRules("2025-2026").exact).toBe(true);
    const older = resolveGraduationRules("2023-2024");
    expect([older.rules.catalogYear, older.exact]).toEqual(["2025-2026", false]);
    const newer = resolveGraduationRules("2027-2028");
    expect([newer.rules.catalogYear, newer.exact]).toEqual(["2026-2027", false]);
    for (const input of [null, undefined, "", "junk", "constructor"]) {
      const resolved = resolveGraduationRules(input);
      expect([resolved.rules.catalogYear, resolved.exact]).toEqual(["2026-2027", false]);
    }
    expect(graduationRulesFor("toString")).toBeNull();
  });
});
