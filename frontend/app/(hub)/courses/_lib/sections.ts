import "server-only";
import { unstable_rethrow } from "next/navigation";
import { routes } from "@/lib/routes";
import type { Section } from "@/lib/types/catalog";
import { getCourse, getSection } from "@/server/catalog";
import { MissingFixtureError } from "@/server/http/fixtures";
import { sectionLabel } from "./format";

/**
 * Section links the course pages resolve on the server (PLAN §5 "Sections"): the sibling a max-0 cross-listing
 * registers under (the same rule as WebTree, server/plan/webtree.ts registerAsOf: the first sibling with seats)
 * and the title of the course a registration-only listing (reg_fors) belongs to.
 */

/** "Register as PHY 214 A": the sibling listing, its CRN and its course page with that section chosen. */
export interface RegisterAs {
  label: string;
  crn: string;
  href: string;
}

async function quiet<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    return null;
  }
}

/** The link for a sibling section (its own course page, that section chosen). */
export function registerAsLink(
  sibling: Pick<Section, "termCode" | "courseCode" | "section" | "crn">,
): RegisterAs {
  return {
    label: sectionLabel(sibling),
    crn: sibling.crn,
    href: `${routes.course(sibling.termCode, sibling.courseCode)}?crn=${sibling.crn}`,
  };
}

/** The sibling a max-0 listing registers under; null when it is not max-0 or no sibling has seats. */
export async function registerAsOf(section: Section): Promise<RegisterAs | null> {
  if (section.enrollment.max !== 0 || section.crossListings.length === 0) return null;
  for (const listing of section.crossListings) {
    const sibling = await quiet(() => getSection(section.termCode, listing.crn));
    if (sibling && sibling.enrollment.max > 0) return registerAsLink(sibling);
  }
  return null;
}

/** registerAsOf for each section that needs it, keyed by the max-0 section's CRN. */
export async function registerAsMap(
  sections: readonly Section[],
): Promise<Record<string, RegisterAs>> {
  const entries = await Promise.all(
    sections.map(async (section) => [section.crn, await registerAsOf(section)] as const),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, RegisterAs] => entry[1] !== null),
  );
}

/** Titles of the courses registration-only listings belong to (regFor code → title). */
export async function regForTitles(sections: readonly Section[]): Promise<Record<string, string>> {
  const codes = [
    ...new Set(sections.flatMap((section) => (section.regFor ? [section.regFor] : []))),
  ];
  const entries = await Promise.all(
    codes.map(async (code) => {
      const section = sections.find((s) => s.regFor === code)!;
      const course = await quiet(() => getCourse(section.termCode, code));
      return [code, course?.title ?? null] as const;
    }),
  );
  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, string] => entry[1] !== null),
  );
}
