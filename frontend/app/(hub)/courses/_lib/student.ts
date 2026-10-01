import "server-only";
import { unstable_rethrow } from "next/navigation";
import { termLabel, type TermCode } from "@/lib/term";
import {
  canonicalCourseCode,
  type Course,
  type ResolvedTerms,
  type Section,
} from "@/lib/types/catalog";
import { normalizeCourseCode } from "@/lib/types/common";
import {
  ACTIVE_PLAN_STATUSES,
  type PlanItem,
  type PlanWarning,
  type ScheduleConflict,
} from "@/lib/types/plan";
import { getSection } from "@/server/catalog";
import { ApiError } from "@/server/http/errors";
import { MissingFixtureError } from "@/server/http/fixtures";
import { detectConflicts, getPlan } from "@/server/plan";
import { factsFromCourse, factsFromSection } from "@/server/plan/catalog";
import { loadPlanContext } from "@/server/plan/context";
import { isCompMet, isSameDegreeCourse } from "@/server/plan/requirements";
import { courseRestrictionWarnings, sectionRestrictionWarnings } from "@/server/plan/restrictions";
import { classesBegun } from "@/server/plan/schedule";
import { standingForTerm, type PlanContext } from "@/server/plan/terms";
import { DAY_NAMES } from "@/components/domain/week-days";
import { clockLabel, parseClock } from "@/components/domain/time-geometry";
import { primarySections, sectionLabel } from "./format";

/**
 * The signed-in student's plan as the course pages need it (server/plan, W5s): which terms each course is already
 * in, the sections chosen per term (for the week grid and conflict checks) and the warnings an add would carry
 * BEFORE the student presses the button (PLAN §5 "Plan items": a retake is warned about, never blocked;
 * "Sections": restrictions flag, never block; conflicts with second meeting times included).
 *
 * The add itself still returns the plan service's own warnings (shown after the add). This module mirrors those
 * rules with the plan service's pure helpers (contractRequest: a `previewAddWarnings` in server/plan). When the
 * plan cannot be read, everything here is "unknown" (null) and the pages work without it.
 */

export interface StudentPlan {
  items: PlanItem[];
  context: PlanContext;
  at: Date;
}

const ACTIVE = new Set<string>(ACTIVE_PLAN_STATUSES);

export async function loadStudentPlan(userId: string, at: Date): Promise<StudentPlan | null> {
  try {
    const [plan, context] = await Promise.all([getPlan(userId), loadPlanContext(userId, at)]);
    return { items: plan.items, context, at };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    if (!(error instanceof ApiError && error.status === 501)) {
      console.error("[courses] could not read the plan:", error);
    }
    return null;
  }
}

function activeItems(plan: StudentPlan): PlanItem[] {
  return plan.items.filter((item) => ACTIVE.has(item.status));
}

/** The codes an item answers to (its listing and its canonical code). */
function itemCodes(item: Pick<PlanItem, "courseCode" | "canonicalCode">): string[] {
  return [...new Set([item.courseCode, item.canonicalCode].map(normalizeCourseCode))];
}

/** The codes a course answers to: its code, its canonical code and every cross-listed sibling. */
export function courseCodes(course: Pick<Course, "code" | "sections">): Set<string> {
  const siblings = course.sections.flatMap((section) =>
    section.crossListings.map((listing) => listing.courseCode),
  );
  return new Set(
    [course.code, canonicalCourseCode(course.code, siblings), ...siblings].map(normalizeCourseCode),
  );
}

/** Terms per course code among active items (planned, registered, in progress, completed). */
export function planPresence(items: readonly PlanItem[]): Map<string, Set<TermCode>> {
  const out = new Map<string, Set<TermCode>>();
  for (const item of items) {
    if (!item.termCode || !ACTIVE.has(item.status)) continue;
    for (const code of itemCodes(item)) {
      const terms = out.get(code) ?? new Set<TermCode>();
      terms.add(item.termCode);
      out.set(code, terms);
    }
  }
  return out;
}

/** Terms the course is already in the plan for. */
export function inPlanTerms(
  presence: ReadonlyMap<string, ReadonlySet<TermCode>> | null,
  codes: ReadonlySet<string>,
): TermCode[] {
  if (!presence) return [];
  const out = new Set<TermCode>();
  for (const code of codes) for (const term of presence.get(code) ?? []) out.add(term);
  return [...out].sort();
}

/** One plan item with the section it chose in its term (null: no section chosen, or it left the schedule). */
export interface PlannedSection {
  item: PlanItem;
  section: Section | null;
}

/** The active items of a term with their chosen sections (one catalog read per CRN, from the in-process index). */
export async function plannedSections(
  plan: StudentPlan,
  term: TermCode,
): Promise<PlannedSection[]> {
  const items = activeItems(plan).filter((item) => item.termCode === term);
  return Promise.all(
    items.map(async (item) => ({
      item,
      section: item.crn ? await getSection(term, item.crn) : null,
    })),
  );
}

/** "Mon, Wed, Fri 10:30a–11:20a" (days that share an overlap window are joined; windows by "; "). */
export function conflictWhen(conflicts: readonly ScheduleConflict[]): string {
  const windows = new Map<string, string[]>();
  for (const conflict of conflicts) {
    const start = parseClock(conflict.start);
    const end = parseClock(conflict.end);
    const time = start !== null && end !== null ? `${clockLabel(start)}–${clockLabel(end)}` : "";
    const days = windows.get(time) ?? [];
    const day = DAY_NAMES[conflict.day].short;
    if (!days.includes(day)) days.push(day);
    windows.set(time, days);
  }
  return [...windows]
    .map(([time, days]) => `${days.join(", ")}${time ? ` ${time}` : ""}`)
    .join("; ");
}

/** Conflicts of `section` with the planned sections of other courses (pairs that involve it). */
export function sectionConflicts(
  section: Section,
  planned: readonly PlannedSection[],
  ownCodes: ReadonlySet<string>,
): { other: Section; conflicts: ScheduleConflict[] }[] {
  const others = planned
    .map((entry) => entry.section)
    .filter((other): other is Section => other !== null)
    .filter((other) => !itemCodesOfSection(other).some((code) => ownCodes.has(code)));
  if (others.length === 0) return [];
  const conflicts = detectConflicts([section, ...others]);
  const byOther = new Map<string, { other: Section; conflicts: ScheduleConflict[] }>();
  for (const conflict of conflicts) {
    if (conflict.a.crn !== section.crn && conflict.b.crn !== section.crn) continue;
    const otherCrn = conflict.a.crn === section.crn ? conflict.b.crn : conflict.a.crn;
    const other = others.find((candidate) => candidate.crn === otherCrn);
    if (!other) continue;
    const entry = byOther.get(otherCrn) ?? { other, conflicts: [] };
    entry.conflicts.push(conflict);
    byOther.set(otherCrn, entry);
  }
  return [...byOther.values()];
}

function itemCodesOfSection(section: Pick<Section, "courseCode" | "crossListings">): string[] {
  return [section.courseCode, ...section.crossListings.map((listing) => listing.courseCode)].map(
    normalizeCourseCode,
  );
}

export interface WarningOptions {
  term: TermCode;
  terms: ResolvedTerms | null;
  /** The section the student is looking at (course page); null = the course without a section (search rows). */
  section?: Section | null;
}

/**
 * What adding `course` to `options.term` would be warned about, in order: a retake (completed in another term),
 * restrictions (standing, permission, W sections once COMP is met) and time conflicts with the term's planned
 * sections. Never a reason to block the add.
 */
export function previewWarnings(
  plan: StudentPlan,
  course: Course,
  planned: readonly PlannedSection[],
  options: WarningOptions,
): PlanWarning[] {
  const { term } = options;
  const codes = courseCodes(course);
  const out: PlanWarning[] = [];
  const active = activeItems(plan);

  const completed = active
    .filter(
      (item) =>
        item.status === "completed" &&
        item.termCode !== term &&
        itemCodes(item).some((code) => codes.has(code)),
    )
    .sort((a, b) => (a.termCode ?? "").localeCompare(b.termCode ?? ""));
  const last = completed.at(-1);
  // The same course planned or taken in another term counts once (server/plan/items.ts itemWarnings "copy").
  const adding = options.section
    ? factsFromSection(options.section)
    : factsFromCourse(course, course.termCode === term);
  const copy = active
    .filter((item) => item.termCode !== term && isSameDegreeCourse(item, adding))
    .sort((a, b) => (a.termCode ?? "").localeCompare(b.termCode ?? ""))[0];
  if (last) {
    out.push({
      code: "already-completed",
      message: last.termCode
        ? `Already completed in ${termLabel(last.termCode)} — plan a retake?`
        : "Already counted as AP/transfer credit — plan a retake?",
      termCode: term,
    });
  } else if (copy) {
    out.push({
      code: "already-completed",
      message: `${course.code} is also ${copy.termCode ? `in your ${termLabel(copy.termCode)} plan` : "listed as AP/transfer credit"} — a course counts once toward the degree unless it may be repeated for credit.`,
      termCode: term,
    });
  }

  if (course.termCode === term) {
    const context = {
      standing: standingForTerm(plan.context, term, plan.at),
      compMet: isCompMet(active, term),
      classesBegun: classesBegun(options.terms, term, plan.at),
      termCode: term,
    };
    out.push(
      ...(options.section
        ? sectionRestrictionWarnings(options.section, context)
        : courseRestrictionWarnings(course.code, course.sections, context)),
    );

    const candidates = options.section ? [options.section] : primarySections(course.sections);
    const clashes = candidates.map((section) => ({
      section,
      conflicts: sectionConflicts(section, planned, codes),
    }));
    const clashing = clashes.filter((entry) => entry.conflicts.length > 0);
    if (clashing.length > 0 && clashing.length === candidates.length) {
      const first = clashing[0]!.conflicts[0]!;
      const others = [
        ...new Set(clashing.flatMap((entry) => entry.conflicts.map((c) => sectionLabel(c.other)))),
      ];
      out.push({
        code: "time-conflict",
        message:
          candidates.length === 1
            ? `${sectionLabel(clashing[0]!.section)} overlaps ${sectionLabel(first.other)} in your ${termLabel(term)} plan (${conflictWhen(first.conflicts)}).`
            : `Every section of ${course.code} overlaps a class in your ${termLabel(term)} plan (${others.join(", ")}).`,
        termCode: term,
      });
    } else {
      for (const entry of clashing.slice(0, 2)) {
        const first = entry.conflicts[0]!;
        out.push({
          code: "time-conflict",
          message: `${sectionLabel(entry.section)} overlaps ${sectionLabel(first.other)} in your ${termLabel(term)} plan (${conflictWhen(first.conflicts)}); another section fits.`,
          termCode: term,
        });
      }
    }
  }
  return out;
}

/** The planned sections of a term, read once per term (shared by every row of a results page). */
export function plannedSectionsCache(
  plan: StudentPlan,
): (term: TermCode) => Promise<PlannedSection[] | null> {
  const cache = new Map<TermCode, Promise<PlannedSection[] | null>>();
  return (term) => {
    let entry = cache.get(term);
    if (!entry) {
      entry = plannedSections(plan, term).catch((error: unknown) => {
        unstable_rethrow(error);
        if (error instanceof MissingFixtureError) throw error;
        console.error("[courses] could not read the plan's sections:", error);
        return null;
      });
      cache.set(term, entry);
    }
    return entry;
  };
}

export interface TermWarningsInput {
  /** Every term the Add to plan control offers. */
  terms: readonly TermCode[];
  /** The course as the page knows it (any term): retakes and copies need no schedule. */
  reference: Course;
  /** The course on a term's schedule (null when it is not offered there, or the read failed). */
  courseIn: (term: TermCode) => Promise<Course | null>;
  planned: (term: TermCode) => Promise<PlannedSection[] | null>;
  resolved: ResolvedTerms | null;
  /** The section the student is looking at in a term (the course page's chosen section, its own term only). */
  sectionIn?: (term: TermCode) => Section | null;
}

/**
 * previewWarnings for every term the control offers, keyed by term (what AddCourse shows for the selected term).
 * A retake or a copy in another term is warned about in every term; restrictions and conflicts only where the
 * course is on that term's schedule.
 */
export async function warningsByTerm(
  plan: StudentPlan,
  input: TermWarningsInput,
): Promise<Record<TermCode, string[]>> {
  const entries = await Promise.all(
    input.terms.map(async (term) => {
      const [offered, planned] = await Promise.all([input.courseIn(term), input.planned(term)]);
      const list = previewWarnings(plan, offered ?? input.reference, planned ?? [], {
        term,
        terms: input.resolved,
        section: offered ? (input.sectionIn?.(term) ?? null) : null,
      });
      return [term, list.map((warning) => warning.message)] as const;
    }),
  );
  return Object.fromEntries(entries.filter(([, list]) => list.length > 0));
}
