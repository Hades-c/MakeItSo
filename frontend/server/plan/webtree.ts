import "server-only";
import type mongoose from "mongoose";
import { prevRegularTerm, termLabel, type TermCode } from "@/lib/term";
import type { ReqCode, ResolvedTerms, Section } from "@/lib/types/catalog";
import {
  WebTreeListSchema,
  type PlanItem,
  type PlanWarning,
  type RequirementSlot,
  type ScheduleConflict,
  type SlotStatus,
  type WebTreeChoice,
  type WebTreeList,
} from "@/lib/types/plan";
import Plan from "@/models/Plan";
import {
  calendarDeadline,
  calendarForTerm,
  isStudentFacing,
  type ContentDeadline,
} from "@/server/content/academic-calendar";
import { slotForCode } from "@/server/content/requirements";
import { now } from "@/server/clock";
import { trusted } from "@/server/db";
import { ApiError, type ApiIssue } from "@/server/http/errors";
import { lookupSection, sectionCodes } from "@/server/plan/catalog";
import { detectConflictsImpl } from "@/server/plan/conflicts";
import { isCompMet, type RequirementsReport } from "@/server/plan/requirements";
import { sectionRestrictionWarnings } from "@/server/plan/restrictions";
import {
  ensurePlanDoc,
  MAX_WEBTREE_LISTS,
  readPlanDoc,
  webtreeChoicesFromDoc,
} from "@/server/plan/store";
import { standingForTerm, type PlanContext } from "@/server/plan/terms";

/**
 * The WebTree list (PLAN §5 "WebTree list"): the student's ranked course preferences with alternates for the
 * registration term, checked against the catalog. MakeItSo never automates WebTree and never asks for Davidson
 * credentials: "Copy for WebTree" gives plain text the student types in themselves.
 *
 * Saving validates the list (ranks unique, every CRN once, each CRN a section of that term whose code or
 * cross-listed sibling code is the choice's course) and replaces the term's list atomically. The report adds, per
 * choice and alternate: the section's title, seats (current/max: seat pressure; a "Register as <sibling>" listing
 * with max 0 shows its sibling), the requirement slots it could fill with their status in the student's plan, and
 * the restriction flags; conflicts across the list (a choice never conflicts with its own alternates: they are
 * either/or); the plain-text copy; and the registration deadlines from the academic calendar.
 */

export interface WebTreeSeats {
  current: number;
  max: number;
  remaining: number;
  /** max(0, remaining). */
  open: number;
  /** remaining < 0. */
  overEnrolled: boolean;
  /** current / max; null when max is 0. */
  pressure: number | null;
}

export interface WebTreeSectionDetail {
  crn: string;
  /** False when the CRN is no longer in the term's schedule. */
  found: boolean;
  courseCode: string;
  section: string | null;
  title: string | null;
  credits: number | null;
  seats: WebTreeSeats | null;
  /** A cross-listed listing with max 0: register (and copy) the sibling's CRN. */
  registerAs: { crn: string; courseCode: string; section: string } | null;
  /** Tracker slots this section's requirement codes could fill, with their status in the plan now. */
  slots: { slot: RequirementSlot; code: ReqCode; status: SlotStatus }[];
  /** Restriction flags (class year, permission, W section once COMP is met). */
  flags: PlanWarning[];
}

export interface WebTreeChoiceDetail {
  rank: number;
  choice: WebTreeSectionDetail;
  alternates: WebTreeSectionDetail[];
}

export interface WebTreeReport {
  list: WebTreeList;
  conflicts: ScheduleConflict[];
  warnings: PlanWarning[];
  details: WebTreeChoiceDetail[];
  /** "Copy for WebTree": plain text, one line per choice plus its alternates. */
  copyText: string;
  /** Registration windows and deadlines for the term (academic calendar, REGISTRAR). */
  deadlines: ContentDeadline[];
}

/** Choices sorted by rank. */
function sorted(choices: readonly WebTreeChoice[]): WebTreeChoice[] {
  return [...choices].sort((a, b) => a.rank - b.rank);
}

/** Structural problems (no catalog needed): duplicate ranks or CRNs, an alternate equal to its choice. */
export function structuralIssues(list: WebTreeList): ApiIssue[] {
  const issues: ApiIssue[] = [];
  const ranks = new Set<number>();
  const crns = new Map<string, string>();
  list.choices.forEach((choice, index) => {
    if (ranks.has(choice.rank)) {
      issues.push({ path: `choices.${index}.rank`, message: `Rank ${choice.rank} is used twice.` });
    }
    ranks.add(choice.rank);
    const seen = (crn: string, path: string) => {
      const first = crns.get(crn);
      if (first) issues.push({ path, message: `CRN ${crn} is already listed (${first}).` });
      else crns.set(crn, path);
    };
    seen(choice.crn, `choices.${index}.crn`);
    choice.alternates.forEach((crn, a) => seen(crn, `choices.${index}.alternates.${a}`));
  });
  return issues;
}

/** Every section of the list's CRNs in its term (missing CRNs are absent from the map). */
async function sectionsOf(list: WebTreeList): Promise<Map<string, Section>> {
  const crns = [...new Set(list.choices.flatMap((choice) => [choice.crn, ...choice.alternates]))];
  const found = await Promise.all(crns.map((crn) => lookupSection(list.termCode, crn)));
  const map = new Map<string, Section>();
  found.forEach((section, index) => {
    if (section) map.set(crns[index]!, section);
  });
  return map;
}

/** Validate a list for saving; returns it with choices sorted by rank. Throws 400 with per-field issues. */
export async function validateWebTreeList(input: WebTreeList): Promise<WebTreeList> {
  const list = WebTreeListSchema.parse(input);
  const issues = structuralIssues(list);
  if (issues.length === 0) {
    const sections = await sectionsOf(list);
    list.choices.forEach((choice, index) => {
      const main = sections.get(choice.crn);
      if (!main) {
        issues.push({
          path: `choices.${index}.crn`,
          message: `CRN ${choice.crn} is not a ${termLabel(list.termCode)} section.`,
        });
      } else if (!sectionCodes(main).includes(choice.courseCode)) {
        issues.push({
          path: `choices.${index}.courseCode`,
          message: `CRN ${choice.crn} is ${main.courseCode} ${main.section}, not ${choice.courseCode}.`,
        });
      }
      choice.alternates.forEach((crn, a) => {
        if (!sections.has(crn)) {
          issues.push({
            path: `choices.${index}.alternates.${a}`,
            message: `CRN ${crn} is not a ${termLabel(list.termCode)} section.`,
          });
        }
      });
    });
  }
  if (issues.length > 0) {
    throw new ApiError(400, "validation_failed", "Some WebTree choices are invalid.", issues);
  }
  return { termCode: list.termCode, choices: sorted(list.choices) };
}

/** The stored list for a term (empty when none). */
export async function readWebTreeList(
  oid: mongoose.Types.ObjectId,
  termCode: TermCode,
): Promise<WebTreeList> {
  const doc = await readPlanDoc(oid, { webtree: 1 });
  const entry = (
    Array.isArray(doc?.webtree) ? (doc.webtree as Record<string, unknown>[]) : []
  ).find((candidate) => candidate.termCode === termCode);
  return { termCode, choices: sorted(webtreeChoicesFromDoc(entry?.choices)) };
}

/** Replace the term's list: positional $set when it exists, else $push guarded by "no list for this term". */
export async function writeWebTreeList(
  userId: string,
  oid: mongoose.Types.ObjectId,
  list: WebTreeList,
): Promise<void> {
  await ensurePlanDoc(userId, oid, { create: true });
  const at = now();
  const choices = list.choices.map((choice) => ({
    rank: choice.rank,
    crn: choice.crn,
    courseCode: choice.courseCode,
    alternates: choice.alternates,
  }));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const replaced = await Plan.updateOne(
      { userId: oid, "webtree.termCode": list.termCode },
      { $set: { "webtree.$.choices": choices, "webtree.$.updatedAt": at } },
    );
    if (replaced.matchedCount === 1) return;
    const added = await Plan.updateOne(
      { userId: oid, "webtree.termCode": trusted({ $ne: list.termCode }) },
      {
        $push: {
          webtree: {
            $each: [{ termCode: list.termCode, choices, updatedAt: at }],
            $sort: { termCode: 1 },
            $slice: -MAX_WEBTREE_LISTS,
          },
        },
      },
    );
    if (added.matchedCount === 1) return;
  }
  throw new ApiError(409, "conflict", "Your WebTree list changed while saving. Please try again.");
}

function seatsOf(section: Section): WebTreeSeats {
  const { current, max, remaining } = section.enrollment;
  return {
    current,
    max,
    remaining,
    open: Math.max(0, remaining),
    overEnrolled: remaining < 0,
    pressure: max > 0 ? Math.round((current / max) * 100) / 100 : null,
  };
}

async function registerAsOf(section: Section): Promise<Section | null> {
  if (section.enrollment.max !== 0 || section.crossListings.length === 0) return null;
  for (const listing of section.crossListings) {
    const sibling = await lookupSection(section.termCode, listing.crn);
    if (sibling && sibling.enrollment.max > 0) return sibling;
  }
  return null;
}

interface DetailContext {
  termCode: TermCode;
  progress: RequirementsReport;
  standing: ReturnType<typeof standingForTerm>;
  compMet: boolean;
}

async function detailOf(
  crn: string,
  courseCode: string,
  section: Section | undefined,
  context: DetailContext,
): Promise<WebTreeSectionDetail> {
  if (!section) {
    return {
      crn,
      found: false,
      courseCode,
      section: null,
      title: null,
      credits: null,
      seats: null,
      registerAs: null,
      slots: [],
      flags: [],
    };
  }
  const sibling = await registerAsOf(section);
  const slots = (section.reqCodes ?? []).flatMap((code) => {
    const slot = slotForCode(code);
    return slot ? [{ slot, code, status: context.progress.reqs[slot] }] : [];
  });
  return {
    crn,
    found: true,
    courseCode: section.courseCode,
    section: section.section,
    title: section.title,
    credits: section.credits,
    seats: seatsOf(sibling ?? section),
    registerAs: sibling
      ? { crn: sibling.crn, courseCode: sibling.courseCode, section: sibling.section }
      : null,
    slots,
    flags: sectionRestrictionWarnings(section, {
      standing: context.standing,
      compMet: context.compMet,
      termCode: context.termCode,
    }),
  };
}

function copyLine(detail: WebTreeSectionDetail): string {
  if (!detail.found) return `CRN ${detail.crn}  ${detail.courseCode}  (no longer in the schedule)`;
  const crn = detail.registerAs?.crn ?? detail.crn;
  const listing = detail.registerAs
    ? `${detail.registerAs.courseCode} ${detail.registerAs.section} (listed as ${detail.courseCode} ${detail.section})`
    : `${detail.courseCode} ${detail.section}`;
  return `CRN ${crn}  ${listing}  ${detail.title ?? ""}`.trimEnd();
}

/**
 * "Copy for WebTree": plain text with rank, CRN, course, section and title per choice, and its alternates
 * (the sibling's CRN for a "Register as" listing). Pure.
 */
export function formatWebTreeCopy(
  termCode: TermCode,
  details: readonly WebTreeChoiceDetail[],
): string {
  const lines = [
    `${termLabel(termCode)} WebTree preferences (from MakeItSo; unofficial: enter them in WebTree yourself)`,
  ];
  if (details.length === 0) lines.push("(no choices yet)");
  for (const detail of details) {
    lines.push(`${detail.rank}. ${copyLine(detail.choice)}`);
    if (detail.alternates.length > 0) {
      lines.push(`   Alternates: ${detail.alternates.map(copyLine).join("; ")}`);
    }
  }
  return lines.join("\n");
}

/**
 * The academic calendar's registration windows and deadlines for `registrationTerm`: rows of the term before it
 * (registration happens then) about WebTree, or naming the term with its schedules or add/drop.
 */
export function registrationDeadlines(registrationTerm: TermCode): ContentDeadline[] {
  let during: TermCode;
  try {
    during = prevRegularTerm(registrationTerm);
  } catch {
    return [];
  }
  const label = termLabel(registrationTerm);
  return calendarForTerm(during)
    .filter(
      (event) =>
        (event.category === "registration" || event.category === "deadline") &&
        isStudentFacing(event) &&
        (/webtree/i.test(`${event.title} ${event.description}`) ||
          (`${event.title} ${event.description}`.includes(label) &&
            /add\/drop|schedules? (?:become )?available/i.test(
              `${event.title} ${event.description}`,
            ))),
    )
    .map(calendarDeadline);
}

export interface WebTreeReportInput {
  list: WebTreeList;
  items: readonly PlanItem[];
  progress: RequirementsReport;
  context: PlanContext;
  at: Date;
  terms: ResolvedTerms;
}

/** The report for a list (see the module comment). */
export async function buildWebTreeReport(input: WebTreeReportInput): Promise<WebTreeReport> {
  const { list, items, progress, context, at } = input;
  const sections = await sectionsOf(list);
  const detailContext: DetailContext = {
    termCode: list.termCode,
    progress,
    standing: standingForTerm(context, list.termCode, at),
    compMet: isCompMet(items, list.termCode),
  };
  const details: WebTreeChoiceDetail[] = [];
  for (const choice of sorted(list.choices)) {
    details.push({
      rank: choice.rank,
      choice: await detailOf(
        choice.crn,
        choice.courseCode,
        sections.get(choice.crn),
        detailContext,
      ),
      alternates: await Promise.all(
        choice.alternates.map((crn) => {
          const section = sections.get(crn);
          return detailOf(crn, section?.courseCode ?? choice.courseCode, section, detailContext);
        }),
      ),
    });
  }

  const group = new Map<string, number>();
  for (const choice of list.choices) {
    for (const crn of [choice.crn, ...choice.alternates]) group.set(crn, choice.rank);
  }
  const listed = [...new Set(list.choices.flatMap((choice) => [choice.crn, ...choice.alternates]))]
    .map((crn) => sections.get(crn))
    .filter((section): section is Section => section !== undefined);
  const conflicts = detectConflictsImpl(listed).filter(
    (conflict) => group.get(conflict.a.crn) !== group.get(conflict.b.crn),
  );

  const warnings: PlanWarning[] = [];
  for (const detail of details) {
    for (const entry of [detail.choice, ...detail.alternates]) {
      if (!entry.found) {
        warnings.push({
          code: "unverified-course",
          message: `CRN ${entry.crn} (${entry.courseCode}) is no longer in the ${termLabel(list.termCode)} schedule.`,
          termCode: list.termCode,
        });
      }
      warnings.push(...entry.flags);
    }
    const retake = items
      .filter(
        (item) =>
          item.status === "completed" &&
          item.termCode !== list.termCode &&
          sections.get(detail.choice.crn) !== undefined &&
          sectionCodes(sections.get(detail.choice.crn)!).includes(item.courseCode),
      )
      .sort((a, b) => (a.termCode ?? "").localeCompare(b.termCode ?? ""))
      .pop();
    if (retake) {
      warnings.push({
        code: "already-completed",
        message: retake.termCode
          ? `${detail.choice.courseCode}: already completed in ${termLabel(retake.termCode)} — plan a retake?`
          : `${detail.choice.courseCode}: already counted as AP/transfer credit — plan a retake?`,
        termCode: list.termCode,
      });
    }
  }

  return {
    list: { termCode: list.termCode, choices: sorted(list.choices) },
    conflicts,
    warnings,
    details,
    copyText: formatWebTreeCopy(list.termCode, details),
    deadlines: registrationDeadlines(list.termCode),
  };
}
