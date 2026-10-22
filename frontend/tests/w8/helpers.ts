import { SectionSchema, type Course, type Section } from "@/lib/types/catalog";
import type { PlanItem } from "@/lib/types/plan";
import { fixtureIndex, fixtureSection } from "../catalog/helpers";

/**
 * W8 test data from the recorded Davidson schedule (tests/fixtures/external/course-schedule: full 202601 and
 * 202602), normalised exactly as the catalog ingest does it, so the course pages are tested on real sections.
 */

/** One real section as the catalog serves it (a plain Section). */
export function section(term: string, code: string, letter: string): Section {
  return SectionSchema.parse(fixtureSection(term, code, letter));
}

/** One real course of a fixture term. */
export function course(term: string, code: string): Course {
  const found = fixtureIndex(term).byCode.get(code)?.course;
  if (!found) throw new Error(`No fixture course ${code} in ${term}`);
  return found;
}

/** A section with fields changed (e.g. enrollment, restrictions), still a valid Section. */
export function withSection(base: Section, patch: Partial<Section>): Section {
  return SectionSchema.parse({ ...base, ...patch });
}

let ids = 0;

/** A plan item (defaults: planned Spring 2027 catalog course). */
export function planItem(overrides: Partial<PlanItem> & { courseCode: string }): PlanItem {
  ids += 1;
  return {
    id: ids.toString(16).padStart(24, "0"),
    termCode: "202602",
    canonicalCode: overrides.courseCode,
    title: overrides.courseCode,
    credits: 1,
    status: "planned",
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...overrides,
  };
}
