import { describe, expect, it } from "vitest";
import {
  eligibleYearsLabel,
  courseRestrictionWarnings,
  excludesStanding,
  sectionRestrictionWarnings,
  type RestrictedSection,
} from "@/server/plan/restrictions";
import {
  defaultFirstTermFor,
  firstYearLastTerm,
  isInPlanRange,
  planRangeLabel,
  planTermRange,
  planTerms,
  standingForTerm,
  standingYear,
  type PlanContext,
} from "@/server/plan/terms";
import {
  addDaysToKey,
  isDateKey,
  weekdayByName,
  weekdayOf,
  zonedInstant,
} from "@/server/plan/time";

/** Pure helpers: the plan's term range, standing per term, restriction flags, ET time arithmetic. */

const NOW = new Date("2026-09-30T16:00:00Z");
const classOf2028: PlanContext = {
  graduationYear: 2028,
  firstTerm: "202401",
  standingOverride: null,
};

describe("plan term range (first term through gradYear+1, summers allowed)", () => {
  it("runs from the first term to the summer after the extra year", () => {
    expect(planTermRange(classOf2028)).toEqual({ first: "202401", last: "202803" });
    expect(planRangeLabel(classOf2028)).toBe("Fall 2024 – Summer 2029");
    const terms = planTerms(classOf2028);
    expect(terms[0]).toBe("202401");
    expect(terms).toContain("202403");
    expect(terms).toContain("202801");
    expect(terms[terms.length - 1]).toBe("202803");
    expect(terms).toHaveLength(15);
  });

  it("defaults the first term to Fall of gradYear − 4", () => {
    expect(defaultFirstTermFor(2030)).toBe("202601");
    expect(planTermRange({ graduationYear: 2030, firstTerm: "bogus" })).toEqual({
      first: "202601",
      last: "203003",
    });
  });

  it.each([
    ["202401", true],
    ["202303", false],
    ["202702", true],
    ["202801", true],
    ["202803", true],
    ["202901", false],
    ["2026", false],
  ])("%s in range: %s", (term, inRange) => {
    expect(isInPlanRange(classOf2028, term)).toBe(inRange);
  });

  it("keeps a first term after the last one inside the range", () => {
    expect(planTermRange({ graduationYear: 2026, firstTerm: "202801" })).toEqual({
      first: "202603",
      last: "202603",
    });
  });

  it("the first year ends after the second regular term", () => {
    expect(firstYearLastTerm("202601")).toBe("202602");
    expect(firstYearLastTerm("202602")).toBe("202701");
    expect(firstYearLastTerm("202503")).toBe("202602");
  });
});

describe("standing per term", () => {
  it("derives it from the graduation year for the term's academic year", () => {
    expect(standingForTerm(classOf2028, "202601", NOW)).toBe("junior");
    expect(standingForTerm(classOf2028, "202602", NOW)).toBe("junior");
    expect(standingForTerm(classOf2028, "202701", NOW)).toBe("senior");
    expect(standingForTerm(classOf2028, "202401", NOW)).toBe("first-year");
  });

  it("shifts an override by the academic years between now and the term", () => {
    const behind: PlanContext = { ...classOf2028, standingOverride: "sophomore" };
    expect(standingForTerm(behind, "202602", NOW)).toBe("sophomore");
    expect(standingForTerm(behind, "202701", NOW)).toBe("junior");
    expect(standingForTerm(behind, "203001", NOW)).toBe("graduated");
  });

  it("maps standings to class years", () => {
    expect(standingYear("incoming")).toBe(1);
    expect(standingYear("first-year")).toBe(1);
    expect(standingYear("senior")).toBe(4);
    expect(standingYear("graduated")).toBeNull();
  });
});

describe("restriction flags (never blocks)", () => {
  const section = (restrictions: Partial<RestrictedSection["restrictions"]>, sec = "A") => ({
    crn: "20025",
    courseCode: "ART 101",
    section: sec,
    restrictions: {
      eligibleYears: null,
      untilFirstDay: false,
      permissionRequired: false,
      notIfCompMet: false,
      ...restrictions,
    },
  });

  it("labels class years", () => {
    expect(eligibleYearsLabel([1])).toBe("first-years");
    expect(eligibleYearsLabel([2, 1])).toBe("first-years and sophomores");
    expect(eligibleYearsLabel([2, 3, 4])).toBe("sophomores, juniors and seniors");
  });

  it("flags a class-year restriction that leaves the student out", () => {
    const firstYears = section({ eligibleYears: [1, 2], untilFirstDay: true });
    expect(excludesStanding(firstYears, "senior")).toBe(true);
    expect(excludesStanding(firstYears, "sophomore")).toBe(false);
    expect(excludesStanding(firstYears, "graduated")).toBe(false);
    expect(
      sectionRestrictionWarnings(firstYears, {
        standing: "senior",
        compMet: false,
        termCode: "202602",
        itemId: "a".repeat(24),
      }),
    ).toEqual([
      {
        code: "restricted-standing",
        message:
          "ART 101 A is limited to first-years and sophomores until the first day of class; you are a senior.",
        itemId: "a".repeat(24),
        termCode: "202602",
      },
    ]);
  });

  it("flags permission and W sections once COMP is met", () => {
    const both = section({ permissionRequired: true, notIfCompMet: true });
    expect(
      sectionRestrictionWarnings(both, { standing: "junior", compMet: false }).map((w) => w.code),
    ).toEqual(["permission-required"]);
    expect(sectionRestrictionWarnings(both, { standing: "junior", compMet: true })).toEqual([
      {
        code: "permission-required",
        message: "ART 101 A needs the instructor's permission to register.",
      },
      {
        code: "comp-met-w-section",
        message: "ART 101 A is closed to students who have met the writing requirement.",
      },
    ]);
  });

  it("flags a course without a section only when every (non-lab) section has the restriction", () => {
    const a = section({ eligibleYears: [1, 2] }, "A");
    const b = section({ eligibleYears: [3, 4] }, "B");
    const lab = section({ eligibleYears: null }, "L");
    expect(
      courseRestrictionWarnings("ART 101", [a, b], { standing: "junior", compMet: false }),
    ).toEqual([]);
    expect(
      courseRestrictionWarnings("ART 101", [a, lab], { standing: "junior", compMet: false }),
    ).toEqual([
      {
        code: "restricted-standing",
        message:
          "Every section of ART 101 is limited to first-years and sophomores; you are a junior.",
      },
    ]);
    expect(
      courseRestrictionWarnings("ART 101", [], { standing: "junior", compMet: false }),
    ).toEqual([]);
  });
});

describe("America/New_York time", () => {
  it("validates calendar dates", () => {
    expect(isDateKey("2026-09-30")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2026-9-30")).toBe(false);
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("names weekdays with meeting letters", () => {
    expect(weekdayOf("2026-09-30")).toBe("W");
    expect(weekdayOf("2026-10-01")).toBe("R");
    expect(weekdayOf("2026-10-03")).toBe("S");
    expect(weekdayOf("2026-10-04")).toBe("U");
    expect(weekdayByName("Monday")).toBe("M");
    expect(weekdayByName("thursday")).toBe("R");
    expect(weekdayByName("Someday")).toBeNull();
  });

  it("turns ET wall-clock times into instants across DST (2026-11-01, 2027-03-14)", () => {
    expect(zonedInstant("2026-09-30", "10:30").toISOString()).toBe("2026-09-30T14:30:00.000Z");
    expect(zonedInstant("2026-11-02", "10:30").toISOString()).toBe("2026-11-02T15:30:00.000Z");
    // The repeated hour on 2026-11-01 resolves to its first (EDT) occurrence; after it, EST.
    expect(zonedInstant("2026-11-01", "01:30").toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(zonedInstant("2026-11-01", "03:00").toISOString()).toBe("2026-11-01T08:00:00.000Z");
    // The skipped hour on 2027-03-14 resolves forward.
    expect(zonedInstant("2027-03-14", "02:30").toISOString()).toBe("2027-03-14T07:30:00.000Z");
    expect(zonedInstant("2027-03-15", "10:30").toISOString()).toBe("2027-03-15T14:30:00.000Z");
    expect(zonedInstant("2027-03-12", "10:30").toISOString()).toBe("2027-03-12T15:30:00.000Z");
    expect(() => zonedInstant("2027-03-15", "25:00")).toThrow(RangeError);
  });
});
