import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  type Course,
  CourseSchema,
  type Instructor,
  type Section,
  SectionSchema,
} from "@/lib/types/catalog";

/**
 * Fixture readers for the W2 tests: the synthetic RMP roster's case list (tests/fixtures/external/ratemyprofessors)
 * and the real instructor lists of the Davidson course API snapshots (tests/fixtures/external/course-schedule),
 * plus Section/Course builders. The parsed roster itself is in roster-fixture.ts.
 */

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "external");

export function readFixtureJson(...parts: string[]): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, ...parts), "utf8")) as unknown;
}

export const CasesSchema = z.object({
  note: z.string(),
  cases: z.array(
    z.object({
      legacyId: z.number().int(),
      firstName: z.string(),
      lastName: z.string(),
      department: z.string(),
      davidson: z.boolean(),
      case: z.string(),
    }),
  ),
});

export function rosterCases() {
  return CasesSchema.parse(readFixtureJson("ratemyprofessors", "cases.json")).cases;
}

const RawSectionSchema = z.object({
  crn: z.coerce.string(),
  course_number: z.string(),
  section: z.string(),
  subject: z.object({ code: z.string() }),
  instructors: z.array(z.object({ first_name: z.string(), last_name: z.string() })),
  cross_listings: z.array(z.object({ subject_code: z.string() })).nullish(),
  departments: z.array(z.object({ code: z.string() })).nullish(),
});

export interface FixtureTeaching {
  instructor: Instructor;
  /** Section subject first, then cross-listed and cross-posted subjects. */
  subjects: string[];
  section: string;
}

/** Every course-schedule snapshot term: full 202601/202602, subsets for the older terms. */
export const FIXTURE_TERMS = [
  "202201",
  "202202",
  "202301",
  "202302",
  "202401",
  "202402",
  "202501",
  "202502",
  "202601",
  "202602",
] as const;
export type FixtureTerm = (typeof FIXTURE_TERMS)[number];

/**
 * Every (instructor, section) pair of a term snapshot, instructors mapped the way the catalog does
 * (Instructor {first, last, isStaff}); subjects = the section's subject, cross-listed siblings' subjects and
 * cross-postings (upstream `departments`).
 */
export function fixtureTeachings(term: FixtureTerm): FixtureTeaching[] {
  const sections = z
    .array(RawSectionSchema)
    .parse(readFixtureJson("course-schedule", `courses-${term}.json`));
  return sections.flatMap((section) => {
    const subjects = [
      section.subject.code,
      ...(section.cross_listings ?? []).map((listing) => listing.subject_code),
      ...(section.departments ?? []).map((department) => department.code),
    ].filter((code, index, all) => all.indexOf(code) === index);
    return section.instructors.map((raw) => ({
      instructor: {
        first: raw.first_name,
        last: raw.last_name,
        isStaff: raw.last_name.trim().toLowerCase() === "staff",
      },
      subjects,
      section: `${section.subject.code} ${section.course_number} ${section.section}`,
    }));
  });
}

/** A valid Section (SectionSchema) with test defaults. */
export function makeSection(
  partial: Partial<Section> & Pick<Section, "courseCode" | "instructors">,
): Section {
  const [subject = "XXX", number = "100"] = partial.courseCode.split(" ");
  return SectionSchema.parse({
    crn: "20001",
    termCode: "202602",
    subject,
    number,
    section: "A",
    title: "Test course",
    credits: 1,
    meetings: [],
    enrollment: { current: 0, max: 20, remaining: 20 },
    reqCodes: null,
    prerequisitesText: null,
    descriptionText: "",
    notes: [],
    restrictions: {
      eligibleYears: null,
      untilFirstDay: false,
      permissionRequired: false,
      notIfCompMet: false,
    },
    crossListings: [],
    crossPostings: [],
    regFor: null,
    ...partial,
  });
}

/** A valid Course (CourseSchema) from sections. */
export function makeCourse(code: string, sections: Section[]): Course {
  return CourseSchema.parse({
    termCode: sections[0]?.termCode ?? "202602",
    code,
    title: sections[0]?.title ?? "Test course",
    sections,
    credits: [1],
    reqCodes: [],
  });
}

export const instructor = (first: string, last: string, isStaff = false): Instructor => ({
  first,
  last,
  isStaff,
});

const teachingKey = (instructor: Instructor) => `${instructor.first}|${instructor.last}`;

/**
 * Per instructor ("First|Last"), every subject they teach in the term: what the catalog search gives
 * server/rmp/course.ts catalogHomeSubjects in production.
 */
export function homeSubjectsByInstructor(
  teachings: readonly FixtureTeaching[],
): ReadonlyMap<string, readonly string[]> {
  const map = new Map<string, Set<string>>();
  for (const { instructor, subjects } of teachings) {
    const key = teachingKey(instructor);
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    for (const subject of subjects) set.add(subject);
  }
  return new Map([...map].map(([key, set]) => [key, [...set].sort()]));
}

export function homeSubjectsOf(
  home: ReadonlyMap<string, readonly string[]>,
  instructor: Instructor,
): readonly string[] {
  return home.get(teachingKey(instructor)) ?? [];
}
