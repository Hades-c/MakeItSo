import { z } from "zod";
import { parseClock, clockLabel } from "@/components/domain/time-geometry";
import type { AddPlanItemBody } from "@/lib/api/plan";
import { dayKey } from "@/lib/format";
import {
  compareTerms,
  prevRegularTerm,
  termsBetween,
  TERM_TIME_ZONE,
  type TermCode,
} from "@/lib/term";
import {
  canonicalCourseCode,
  type Course,
  type CrossListing,
  type Instructor,
  type Meeting,
  type Section,
  type TermInfo,
} from "@/lib/types/catalog";
import { CourseCodeSchema, TermCodeSchema } from "@/lib/types/common";
import { ACTIVE_PLAN_STATUSES, type PlanItem, type PlanStatus } from "@/lib/types/plan";

/**
 * Plan rules for steps 2 and 3 (PLAN §3 /onboarding 2–3, §5 "Plan items"). A re-run never duplicates an item: the
 * plan's key is (termCode, canonicalCode) among active items, so before adding, the step looks for an active item
 * with the same key and either does nothing or only sets its CRN. The server enforces the same key (409), which
 * the steps treat as "already there" and answer by reloading the plan. Pure and isomorphic.
 */

const ACTIVE = new Set<PlanStatus>(ACTIVE_PLAN_STATUSES);

export function isActiveItem(item: Pick<PlanItem, "status">): boolean {
  return ACTIVE.has(item.status);
}

type SiblingCodes = readonly (string | Pick<CrossListing, "courseCode">)[];

/**
 * The active item holding (termCode, code): same canonical code (cross-listed siblings are one course) or the same
 * listing. `termCode` null = AP/transfer credit without a term.
 */
export function findActiveItem(
  items: readonly PlanItem[],
  termCode: TermCode | null,
  code: string,
  siblings: SiblingCodes = [],
): PlanItem | undefined {
  const canonical = canonicalCourseCode(code, siblings);
  return items.find(
    (item) =>
      isActiveItem(item) &&
      item.termCode === termCode &&
      (item.canonicalCode === canonical ||
        item.courseCode === code ||
        item.canonicalCode === code ||
        item.courseCode === canonical),
  );
}

export type ClassAction =
  { kind: "add" } | { kind: "set-crn"; itemId: string } | { kind: "none"; itemId: string };

/**
 * What choosing `crn` for a current-term class does: add a new item, set the CRN of the item already holding the
 * course (added without a section on /courses, or by a legacy plan), or nothing (that section is already chosen).
 */
export function classAction(
  items: readonly PlanItem[],
  termCode: TermCode,
  code: string,
  siblings: SiblingCodes,
  crn: string,
): ClassAction {
  const existing = findActiveItem(items, termCode, code, siblings);
  if (!existing) return { kind: "add" };
  if (existing.crn === crn) return { kind: "none", itemId: existing.id };
  return { kind: "set-crn", itemId: existing.id };
}

/** Classes of the current term: in progress once the term has started (ET), registered before. */
export function currentClassStatus(
  term: Pick<TermInfo, "startDate"> | undefined,
  now: Date | string,
): Extract<PlanStatus, "in-progress" | "registered"> {
  if (!term?.startDate) return "in-progress";
  return dayKey(now, TERM_TIME_ZONE) >= term.startDate ? "in-progress" : "registered";
}

/** The student starts after the current term (an incoming student): nothing to add for it, nothing completed. */
export function startsAfter(firstTerm: TermCode, currentTerm: TermCode): boolean {
  return compareTerms(firstTerm, currentTerm) > 0;
}

/**
 * Terms a completed course can be from: the first term through the term before the current one, newest first.
 * Empty in the first semester (AP/transfer credit is still possible).
 */
export function completedTermOptions(firstTerm: TermCode, currentTerm: TermCode): TermCode[] {
  const last = prevRegularTerm(currentTerm);
  if (compareTerms(firstTerm, last) > 0) return [];
  return termsBetween(firstTerm, last).reverse();
}

/** The sections a student can pick: one section is chosen for them (auto-select). */
export function autoSection(course: Pick<Course, "sections">): Section | null {
  return course.sections.length === 1 ? (course.sections[0] ?? null) : null;
}

const DAY_ORDER = ["M", "T", "W", "R", "F", "S", "U"] as const;

/** "MWF 10:30a–11:20a · Chambers 1012", "Time TBA", "Lab · T 1:40p–4:30p". */
export function meetingLabel(meeting: Meeting): string {
  const start = parseClock(meeting.start);
  const end = parseClock(meeting.end);
  const kind = meeting.kind === "lab" ? "Lab · " : "";
  if (meeting.tba || meeting.days.length === 0 || start === null || end === null) {
    return `${kind}Time TBA`;
  }
  const days = [...meeting.days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  const place = [meeting.building, meeting.room].filter(Boolean).join(" ");
  return `${kind}${days.join("")} ${clockLabel(start)}–${clockLabel(end)}${place ? ` · ${place}` : ""}`;
}

/** "Ada Lovelace, Alan Turing"; Staff → "Staff (TBA)"; API order kept. */
export function instructorLabel(instructors: readonly Instructor[]): string {
  if (instructors.length === 0) return "Staff (TBA)";
  return instructors
    .map((person) =>
      person.isStaff ? "Staff (TBA)" : [person.first, person.last].filter(Boolean).join(" "),
    )
    .join(", ");
}

// ---- Manual, AP and transfer entries (step 3) ------------------------------------------------------------------

export const MANUAL_KINDS = ["ap", "transfer", "manual"] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];

export const MANUAL_KIND_LABELS: Readonly<Record<ManualKind, string>> = {
  ap: "AP or IB credit",
  transfer: "Transfer credit",
  manual: "Davidson course not in the search",
};

/**
 * A quick-add entry. AP and transfer credit may have no term (pre-matriculation); a Davidson course needs one.
 * The course code is the Davidson equivalent ("MAT 113"); the title and credits are used only when the code is
 * in no ingested term (the server takes them from the catalog otherwise).
 */
export const ManualEntrySchema = z
  .object({
    kind: z.enum(MANUAL_KINDS),
    courseCode: CourseCodeSchema,
    title: z.string().trim().max(200).optional(),
    credits: z.number().min(0, "Credits run from 0 to 4.").max(4, "Credits run from 0 to 4."),
    termCode: TermCodeSchema.nullable(),
  })
  .superRefine((entry, ctx) => {
    if (entry.kind === "manual" && entry.termCode === null) {
      ctx.addIssue({
        code: "custom",
        path: ["termCode"],
        message: "Pick the term you took it in.",
      });
    }
  });
export type ManualEntryInput = z.input<typeof ManualEntrySchema>;
export type ManualEntry = z.output<typeof ManualEntrySchema>;

/** The POST /api/plan/items body for a quick-add entry (always completed). */
export function manualAddBody(entry: ManualEntry): AddPlanItemBody {
  return {
    termCode: entry.termCode,
    courseCode: entry.courseCode,
    status: "completed",
    source: entry.kind,
    manualCredits: entry.credits,
    ...(entry.title ? { manualTitle: entry.title } : {}),
  };
}

/** The POST body for a course found in a past term's catalog. */
export function completedAddBody(termCode: TermCode, courseCode: string): AddPlanItemBody {
  return { termCode, courseCode, status: "completed", source: "catalog" };
}

/** The POST body for a current-term class with its section. */
export function classAddBody(
  termCode: TermCode,
  courseCode: string,
  crn: string,
  status: Extract<PlanStatus, "in-progress" | "registered">,
): AddPlanItemBody {
  return { termCode, courseCode, crn, status, source: "catalog" };
}

/** Items to list on step 3: completed ones, AP/transfer first, then newest term first. */
export function completedItems(items: readonly PlanItem[]): PlanItem[] {
  return items
    .filter((item) => item.status === "completed")
    .sort((a, b) => {
      if (a.termCode === b.termCode) return a.courseCode.localeCompare(b.courseCode);
      if (a.termCode === null) return -1;
      if (b.termCode === null) return 1;
      return compareTerms(b.termCode, a.termCode);
    });
}

/** Active items of one term, by code. */
export function termItems(items: readonly PlanItem[], termCode: TermCode): PlanItem[] {
  return items
    .filter((item) => item.termCode === termCode && isActiveItem(item))
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}
