import "server-only";
import type { ClassStanding } from "@/lib/term";
import type { Section } from "@/lib/types/catalog";
import type { PlanWarning } from "@/lib/types/plan";
import { standingLabel, standingYear } from "@/server/plan/terms";

/**
 * Registration restrictions as warnings (PLAN §5 "Sections": Add-to-plan and AI FLAG, never block): class-year
 * codes against the student's standing, PRM (permission required), and W sections once the writing requirement
 * (COMP) is met. Pure.
 */

export type RestrictedSection = Pick<Section, "crn" | "courseCode" | "section" | "restrictions">;

export interface RestrictionContext {
  /** The student's standing during the section's term (server/plan/terms.ts standingForTerm). */
  standing: ClassStanding;
  /** A completed COMP course (never AP/transfer), or one in progress before the section's term. */
  compMet: boolean;
  termCode?: string;
  itemId?: string;
}

const YEAR_NAMES = ["first-years", "sophomores", "juniors", "seniors"] as const;

/** [1] → "first-years"; [1, 2] → "first-years and sophomores"; [2, 3, 4] → "sophomores, juniors and seniors". */
export function eligibleYearsLabel(years: readonly number[]): string {
  const names = [...new Set(years)]
    .sort((a, b) => a - b)
    .map((year) => YEAR_NAMES[year - 1])
    .filter((name): name is (typeof YEAR_NAMES)[number] => name !== undefined);
  if (names.length <= 1) return names[0] ?? "some class years";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Does the section's class-year restriction leave the student out? (null years = open to everyone.) */
export function excludesStanding(section: RestrictedSection, standing: ClassStanding): boolean {
  const years = section.restrictions.eligibleYears;
  if (!years || years.length === 0) return false;
  const year = standingYear(standing);
  return year !== null && !years.includes(year);
}

function label(section: Pick<Section, "courseCode" | "section">): string {
  return `${section.courseCode} ${section.section}`;
}

function extra(context: RestrictionContext): Pick<PlanWarning, "itemId" | "termCode"> {
  return {
    ...(context.itemId ? { itemId: context.itemId } : {}),
    ...(context.termCode ? { termCode: context.termCode } : {}),
  };
}

/** Warnings for one section (in this order: standing, permission, W section). */
export function sectionRestrictionWarnings(
  section: RestrictedSection,
  context: RestrictionContext,
): PlanWarning[] {
  const out: PlanWarning[] = [];
  const years = section.restrictions.eligibleYears;
  if (years && excludesStanding(section, context.standing)) {
    const until = section.restrictions.untilFirstDay ? " until the first day of class" : "";
    out.push({
      code: "restricted-standing",
      message: `${label(section)} is limited to ${eligibleYearsLabel(years)}${until}; you are ${standingLabel(context.standing)}.`,
      ...extra(context),
    });
  }
  if (section.restrictions.permissionRequired) {
    out.push({
      code: "permission-required",
      message: `${label(section)} needs the instructor's permission to register.`,
      ...extra(context),
    });
  }
  if (section.restrictions.notIfCompMet && context.compMet) {
    out.push({
      code: "comp-met-w-section",
      message: `${label(section)} is closed to students who have met the writing requirement.`,
      ...extra(context),
    });
  }
  return out;
}

/**
 * Warnings for a course planned without a section: a restriction is flagged only when EVERY section has it (a
 * student can still pick an open section). Companion lab sections are ignored when lecture sections exist.
 */
export function courseRestrictionWarnings(
  courseCode: string,
  sections: readonly RestrictedSection[],
  context: RestrictionContext,
): PlanWarning[] {
  const primary = sections.filter((section) => !/^L\d{0,2}$/.test(section.section));
  const pool = primary.length > 0 ? primary : sections;
  if (pool.length === 0) return [];
  const out: PlanWarning[] = [];
  if (pool.every((section) => excludesStanding(section, context.standing))) {
    const years = [...new Set(pool.flatMap((section) => section.restrictions.eligibleYears ?? []))];
    out.push({
      code: "restricted-standing",
      message: `Every section of ${courseCode} is limited to ${eligibleYearsLabel(years)}; you are ${standingLabel(context.standing)}.`,
      ...extra(context),
    });
  }
  if (pool.every((section) => section.restrictions.permissionRequired)) {
    out.push({
      code: "permission-required",
      message: `${courseCode} needs the instructor's permission to register.`,
      ...extra(context),
    });
  }
  if (context.compMet && pool.every((section) => section.restrictions.notIfCompMet)) {
    out.push({
      code: "comp-met-w-section",
      message: `${courseCode} is closed to students who have met the writing requirement.`,
      ...extra(context),
    });
  }
  return out;
}
