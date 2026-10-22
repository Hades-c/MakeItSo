import { describe, expect, it } from "vitest";
import {
  AvailabilitySchema,
  canonicalCourseCode,
  crossListedCodes,
  CatalogQuerySchema,
  CourseSchema,
  SectionSchema,
  TermInfoSchema,
  type CatalogQueryInput,
  type Section,
} from "@/lib/types/catalog";
import { CourseCodeSchema, normalizeCourseCode } from "@/lib/types/common";
import { ConflictInputSchema } from "@/lib/types/plan";

/** BIO 331 A, Fall 2026, as W1 should normalise it (cross-listed with PSY 303 A, max 0 seats). */
const bio331: Section = {
  crn: "10371",
  termCode: "202601",
  courseCode: "BIO 331",
  subject: "BIO",
  number: "331",
  section: "A",
  title: "Psy Research: Behavioral Neuro",
  credits: 1,
  instructors: [{ first: "Julio", last: "Ramirez", isStaff: false }],
  meetings: [
    {
      days: ["M", "W"],
      start: "13:40",
      end: "14:55",
      building: "Wall Academic Center",
      room: "256",
      kind: "class",
      tba: false,
    },
    { days: [], start: null, end: null, kind: "second", tba: true },
  ],
  enrollment: { current: 0, max: 0, remaining: 0 },
  reqCodes: ["NSRQ"],
  prerequisitesText: "PSY 101 and PSY 102 or permission of instructor.",
  descriptionText: "Laboratory research in behavioral neuroscience.",
  notes: [
    "Cross-listed; see course description for equivalent course (registration may be required in the equivalent course)",
  ],
  restrictions: {
    eligibleYears: [3, 4],
    untilFirstDay: true,
    permissionRequired: false,
    notIfCompMet: false,
  },
  crossListings: [{ crn: "10440", courseCode: "PSY 303", section: "A" }],
  crossPostings: ["IGEN", "INEU", "PBH", "PSY"],
  regFor: null,
  registrationSections: [],
};

describe("catalog types (PLAN §4.1.2)", () => {
  it("accepts a normalised section and course", () => {
    expect(SectionSchema.parse(bio331)).toEqual(bio331);
    expect(
      CourseSchema.parse({
        termCode: "202601",
        code: "BIO 331",
        title: bio331.title,
        sections: [bio331],
        credits: [1],
        reqCodes: ["NSRQ"],
      }).sections,
    ).toHaveLength(1);
  });

  it("parses older data without the additive fields (registrationSections [], topics false)", () => {
    const { registrationSections: _omitted, ...older } = bio331;
    expect(SectionSchema.parse(older).registrationSections).toEqual([]);
    const che430 = {
      ...bio331,
      registrationSections: [{ crn: "20083", courseCode: "bio395", section: "A" }],
    };
    expect(SectionSchema.parse(che430).registrationSections).toEqual([
      { crn: "20083", courseCode: "BIO 395", section: "A" },
    ]);
    const course = { termCode: "202601", code: "BIO 331", title: bio331.title, sections: [older] };
    const parsed = CourseSchema.parse({ ...course, credits: [1], reqCodes: ["NSRQ"] });
    expect(parsed.topics).toBe(false);
    expect(parsed.sections[0]?.registrationSections).toEqual([]);
    expect(CourseSchema.parse({ ...course, credits: [1], reqCodes: [], topics: true }).topics).toBe(
      true,
    );
  });

  it("keeps 'no requirement data' (null) distinct from NONE and never []", () => {
    expect(SectionSchema.safeParse({ ...bio331, reqCodes: null }).success).toBe(true);
    expect(SectionSchema.safeParse({ ...bio331, reqCodes: ["NONE"] }).success).toBe(true);
    expect(SectionSchema.safeParse({ ...bio331, reqCodes: [] }).success).toBe(false);
    expect(SectionSchema.safeParse({ ...bio331, reqCodes: ["WRIT"] }).success).toBe(false);
  });

  it("validates meetings, times and CRNs", () => {
    const badTime = { ...bio331, meetings: [{ ...bio331.meetings[0]!, start: "1340" }] };
    expect(SectionSchema.safeParse(badTime).success).toBe(false);
    expect(SectionSchema.safeParse({ ...bio331, crn: 10371 }).data?.crn).toBe("10371");
    expect(SectionSchema.safeParse({ ...bio331, crn: "abc" }).success).toBe(false);
    expect(SectionSchema.safeParse({ ...bio331, credits: -1 }).success).toBe(false);
  });

  it("normalises course codes", () => {
    expect(normalizeCourseCode(" csc121 ")).toBe("CSC 121");
    expect(normalizeCourseCode("CSC   221")).toBe("CSC 221");
    expect(CourseCodeSchema.parse("mus012")).toBe("MUS 012");
    expect(CourseCodeSchema.safeParse("CSC-221").success).toBe(false);
    expect(CourseCodeSchema.safeParse("Intro to CS").success).toBe(false);
  });

  it("maps cross-listed siblings to one canonical code", () => {
    expect(canonicalCourseCode("PSY 303", ["BIO 331"])).toBe("BIO 331");
    expect(canonicalCourseCode("BIO 331", ["PSY 303"])).toBe("BIO 331");
    expect(canonicalCourseCode("CSC 221")).toBe("CSC 221");
    expect(canonicalCourseCode("PSY 303", bio331.crossListings)).toBe("PSY 303");
    expect(canonicalCourseCode(bio331.courseCode, bio331.crossListings)).toBe("BIO 331");
  });

  it("keys cross-listed siblings by CRN (ENV 214 A → PHY 214 A, not PHY 214 B)", () => {
    const env214a = {
      ...bio331,
      crn: "10227",
      courseCode: "ENV 214",
      subject: "ENV",
      number: "214",
      enrollment: { current: 0, max: 0, remaining: 0 },
      crossListings: [{ crn: "10393", courseCode: "phy214", section: "A" }],
    };
    const parsed = SectionSchema.parse(env214a);
    expect(parsed.crossListings).toEqual([{ crn: "10393", courseCode: "PHY 214", section: "A" }]);
    expect(crossListedCodes([...parsed.crossListings, { courseCode: "PHY 214" }])).toEqual([
      "PHY 214",
    ]);
    // The old code-only form is rejected: it cannot say which PHY 214 section to register in.
    expect(SectionSchema.safeParse({ ...env214a, crossListings: ["PHY 214"] }).success).toBe(false);
    expect(ConflictInputSchema.parse(parsed).crossListings[0]?.crn).toBe("10393");
  });

  it("parses URL-shaped catalog queries with defaults", () => {
    expect(CatalogQuerySchema.parse({})).toEqual({
      q: "",
      dept: [],
      req: [],
      days: [],
      openOnly: false,
      level: [],
      page: 1,
      pageSize: 25,
    });
    expect(
      CatalogQuerySchema.parse({
        term: "202602",
        q: "  data   science ",
        dept: "CSC,MAT",
        req: ["LTRQ", "SSRQ"],
        days: ["M", "W", "F"],
        after: "09:00",
        openOnly: "1",
        level: "200",
        page: "2",
        pageSize: "50",
      }),
    ).toMatchObject({
      term: "202602",
      q: "data science",
      dept: ["CSC", "MAT"],
      req: ["LTRQ", "SSRQ"],
      days: ["M", "W", "F"],
      after: "09:00",
      openOnly: true,
      level: ["200"],
      page: 2,
      pageSize: 50,
    });
    for (const bad of [
      { days: "X" },
      { req: "WRIT" },
      { pageSize: "500" },
      { openOnly: "maybe" },
    ]) {
      expect(CatalogQuerySchema.safeParse(bad).success).toBe(false);
    }
    // Typed callers may pass only what they need.
    const typed: CatalogQueryInput = { term: "202602", dept: ["CSC"] };
    expect(CatalogQuerySchema.parse(typed).dept).toEqual(["CSC"]);
  });

  it("describes terms and availability", () => {
    expect(
      TermInfoSchema.parse({
        code: "202602",
        label: "Spring 2027",
        isActive: false,
        isRegistration: true,
        isSummer: false,
        published: true,
        startDate: "2027-01-19",
        endDate: "2027-05-12",
      }).isRegistration,
    ).toBe(true);
    expect(
      AvailabilitySchema.parse({
        termCode: "202701",
        status: "not-yet-published",
        usually: { season: "Fall", basedOn: ["202601", "202501"] },
      }).status,
    ).toBe("not-yet-published");
    expect(AvailabilitySchema.safeParse({ termCode: "202701", status: "offered?" }).success).toBe(
      false,
    );
  });
});
