import "server-only";
import mongoose from "mongoose";
import type { z } from "zod";
import {
  AddPlanItemBodySchema,
  UpdatePlanItemBodySchema,
  type AddPlanItemInput,
  type UpdatePlanItemInput,
} from "@/lib/api/plan";
import { termLabel, type TermCode } from "@/lib/term";
import { canonicalCourseCode, type ResolvedTerms, type Section } from "@/lib/types/catalog";
import {
  ACTIVE_PLAN_STATUSES,
  type PlanItem,
  type PlanStatus,
  type PlanWarning,
} from "@/lib/types/plan";
import Plan from "@/models/Plan";
import { now } from "@/server/clock";
import { catalogYearForTerm, resolveGraduationRules } from "@/server/content/requirements";
import { trusted } from "@/server/db";
import { ApiError, zodIssues } from "@/server/http/errors";
import {
  catalogTerms,
  factsFromSection,
  isPublished,
  lookupCourse,
  lookupSection,
  sectionCodes,
  type CourseFacts,
} from "@/server/plan/catalog";
import { conflictWindowLabel, detectConflictsImpl } from "@/server/plan/conflicts";
import { loadPlanContext, userObjectId } from "@/server/plan/context";
import { readLegacyPlanImpl } from "@/server/plan/legacy";
import { isCompMet, isSameDegreeCourse } from "@/server/plan/requirements";
import { courseRestrictionWarnings, sectionRestrictionWarnings } from "@/server/plan/restrictions";
import { classesBegun } from "@/server/plan/schedule";
import {
  ensurePlanDoc,
  itemFromDoc,
  itemToDoc,
  MAX_PLAN_ITEMS,
  newId,
  readPlanDoc,
} from "@/server/plan/store";
import {
  isInPlanRange,
  planRangeLabel,
  standingForTerm,
  type PlanContext,
} from "@/server/plan/terms";

/**
 * Plan item mutations (PLAN §5 "Plan items"). Every write is one atomic update on the student's document:
 *   - add:    findOneAndUpdate({ userId, items: { $not: { $elemMatch: { termCode, canonicalCode, status ∈ active } } },
 *             "items.<max-1>": { $exists: false } }, { $push }) — a concurrent duplicate simply does not match (409);
 *   - remove: $pull by id;
 *   - patch:  $set through the filtered positional operator (items.$[it].field) on exactly the fields the patch
 *             names (status, passFail, note), plus, when the listing changes (a new CRN or term), the term, the CRN
 *             and the catalog facts they imply. The filter guards the item's key fields (and, for a listing change,
 *             its stored CRN and code), so a concurrent change to what the write was computed from makes it miss and
 *             retry; "no other active item has the key" guards reactivations and moves. Fields the patch does not
 *             name are never written, so concurrent patches of different fields all survive.
 * A v2 document is written only once a change is certain: validation, 404s and 409s come first (a legacy
 * student's plan stays in memory until then).
 * The duplicate key is (termCode, canonicalCode) among items that are not dropped/failed/withdrawn. The same code
 * in another term is always allowed (retakes, ensembles, topics courses): the answer warns instead.
 *
 * Adds are validated against the catalog: title, credits and requirement codes come from the listing the student
 * registers under (the CRN's section when given, else the course in that term, else its nearest offering); a code
 * in no ingested term becomes a manual, unverified entry (credits 1 unless given; AI drafts must be real codes).
 * Restrictions (class year, permission, W sections once COMP is met) are warnings, never blocks.
 */

export interface AddItemResult {
  item: PlanItem;
  warnings: PlanWarning[];
}

const ACTIVE = new Set<PlanStatus>(ACTIVE_PLAN_STATUSES);
const ACTIVE_LIST = [...ACTIVE_PLAN_STATUSES];
/** Statuses for which registration restrictions matter. */
const REGISTERING = new Set<PlanStatus>(["planned", "registered"]);
const UPDATE_ATTEMPTS = 3;

function invalid(message: string, path?: string): ApiError {
  return new ApiError(400, "validation_failed", message, path ? [{ path, message }] : undefined);
}

function itemsOf(doc: Record<string, unknown> | null): PlanItem[] {
  return Array.isArray(doc?.items)
    ? (doc.items as Record<string, unknown>[]).flatMap((raw) => itemFromDoc(raw) ?? [])
    : [];
}

/**
 * The student's items now (v2, else the legacy conversion, else none): the snapshot validation and warnings are
 * computed on. `stored` is false while the plan is only the in-memory legacy view (or empty).
 */
async function currentItems(
  userId: string,
  oid: mongoose.Types.ObjectId,
): Promise<{ items: PlanItem[]; stored: boolean }> {
  const doc = await readPlanDoc(oid, { items: 1 });
  if (doc) return { items: itemsOf(doc), stored: true };
  return { items: (await readLegacyPlanImpl(userId))?.items ?? [], stored: false };
}

function notInPlan(): ApiError {
  return new ApiError(404, "not_found", "That course is not in your plan.");
}

/** Same key: the (termCode, canonicalCode) of another active item. */
function takenBy(items: readonly PlanItem[], item: PlanItem): PlanItem | undefined {
  return items.find(
    (other) =>
      other.id !== item.id &&
      other.termCode === item.termCode &&
      other.canonicalCode === item.canonicalCode &&
      ACTIVE.has(other.status),
  );
}

function sameCourse(a: Pick<PlanItem, "courseCode" | "canonicalCode">, b: typeof a): boolean {
  return (
    a.canonicalCode === b.canonicalCode ||
    a.courseCode === b.courseCode ||
    a.courseCode === b.canonicalCode ||
    a.canonicalCode === b.courseCode
  );
}

function checkTerm(
  context: PlanContext,
  termCode: TermCode | null,
  source: PlanItem["source"],
): void {
  if (termCode === null) {
    if (source !== "ap" && source !== "transfer") {
      throw invalid(
        "Pick a term. Only AP and transfer credit can be listed without a term.",
        "termCode",
      );
    }
    return;
  }
  if (!isInPlanRange(context, termCode)) {
    throw invalid(
      `${termLabel(termCode)} is outside your plan (${planRangeLabel(context)}).`,
      "termCode",
    );
  }
}

/** The section for a CRN, which must be a listing of `courseCode` (or of its cross-listed siblings). */
async function sectionFor(
  termCode: TermCode | null,
  crn: string,
  course: Pick<PlanItem, "courseCode" | "canonicalCode">,
): Promise<Section> {
  if (termCode === null) throw invalid("A CRN needs a term.", "crn");
  const section = await lookupSection(termCode, crn);
  if (!section) throw invalid(`CRN ${crn} is not a ${termLabel(termCode)} section.`, "crn");
  const codes = sectionCodes(section);
  const canonical = canonicalCourseCode(section.courseCode, section.crossListings);
  if (
    !codes.includes(course.courseCode) &&
    canonical !== course.canonicalCode &&
    canonical !== course.courseCode
  ) {
    throw invalid(
      `CRN ${crn} is ${section.courseCode} ${section.section}, not ${course.courseCode}.`,
      "crn",
    );
  }
  return section;
}

interface WarningInput {
  item: PlanItem;
  facts: CourseFacts | null;
  section: Section | null;
  others: readonly PlanItem[];
  context: PlanContext;
  at: Date;
  /** The catalog's terms; null when they could not be loaded (a patch that needs no catalog still succeeds). */
  terms: ResolvedTerms | null;
  /** The stored CRN no longer resolves in the item's term (a cancelled or renumbered section). */
  staleCrn?: boolean;
}

/** A section lookup for warnings only: a catalog failure means no warning, never a failed change. */
async function sectionForWarnings(termCode: TermCode, crn: string): Promise<Section | null> {
  try {
    return await lookupSection(termCode, crn);
  } catch {
    return null;
  }
}

/** Warnings for an item as it would be stored (retake, restrictions, unverified, NSCI, P/F, time conflicts). */
async function itemWarnings(input: WarningInput): Promise<PlanWarning[]> {
  const { item, facts, section, others, context, at, terms } = input;
  const out: PlanWarning[] = [];
  const ref = { itemId: item.id, ...(item.termCode ? { termCode: item.termCode } : {}) };
  const active = ACTIVE.has(item.status);

  if (active) {
    const byTerm = (a: PlanItem, b: PlanItem) => (a.termCode ?? "").localeCompare(b.termCode ?? "");
    const completed = others
      .filter(
        (other) =>
          other.status === "completed" &&
          other.termCode !== item.termCode &&
          sameCourse(other, item),
      )
      .sort(byTerm);
    const last = completed[completed.length - 1];
    // The same course planned or taken in another term: it counts once (server/plan/requirements.ts).
    const copy = others
      .filter(
        (other) =>
          ACTIVE.has(other.status) &&
          other.termCode !== item.termCode &&
          isSameDegreeCourse(other, item),
      )
      .sort(byTerm)[0];
    if (last) {
      out.push({
        code: "already-completed",
        message: last.termCode
          ? `Already completed in ${termLabel(last.termCode)} — plan a retake?`
          : `Already counted as AP/transfer credit — plan a retake?`,
        ...ref,
      });
    } else if (copy) {
      out.push({
        code: "already-completed",
        message: `${item.courseCode} is also ${copy.termCode ? `in your ${termLabel(copy.termCode)} plan` : "listed as AP/transfer credit"} — a course counts once toward the degree unless it may be repeated for credit.`,
        ...ref,
      });
    }
  }

  if (input.staleCrn && active && item.crn && item.termCode) {
    out.push({
      code: "unverified-course",
      message: `CRN ${item.crn} is no longer in the ${termLabel(item.termCode)} schedule: pick another section of ${item.courseCode}, or clear the CRN.`,
      ...ref,
    });
  }

  if (REGISTERING.has(item.status) && item.termCode && facts?.sameTerm) {
    const restriction = {
      standing: standingForTerm(context, item.termCode, at),
      compMet: isCompMet(others, item.termCode),
      classesBegun: classesBegun(terms, item.termCode, at),
      ...ref,
    };
    out.push(
      ...(section
        ? sectionRestrictionWarnings(section, restriction)
        : courseRestrictionWarnings(item.courseCode, facts.sections, restriction)),
    );
  }

  if (item.unverified) {
    out.push({
      code: "unverified-course",
      message: `${item.courseCode} is not in the Davidson course data; it is saved as an unverified entry.`,
      ...ref,
    });
  } else if (
    facts &&
    !facts.sameTerm &&
    item.termCode &&
    terms &&
    isPublished(terms, item.termCode)
  ) {
    out.push({
      code: "unverified-course",
      message: `${item.courseCode} is not in the ${termLabel(item.termCode)} schedule — check the term. Title and credits come from ${termLabel(facts.termCode)}.`,
      ...ref,
    });
  }

  if (item.reqCodes?.includes("NSCI")) {
    out.push({
      code: "nsci-verify",
      message: `${item.courseCode} carries the legacy NSCI tag: verify in Degree Works whether it counts for Natural Science.`,
      ...ref,
    });
  } else if (!item.unverified && item.reqCodes === null && item.credits > 0) {
    const sectionsDiffer =
      !section && (facts?.sections ?? []).some((candidate) => candidate.reqCodes !== null);
    out.push({
      code: "no-requirement-data",
      message: `No requirement data for ${item.courseCode}${item.termCode ? ` in ${termLabel(item.termCode)}` : ""}${sectionsDiffer ? " (its sections carry different requirements: pick a section)" : ""}.`,
      ...ref,
    });
  }

  if (item.passFail && active && item.source !== "transfer" && item.source !== "ap") {
    const elected = [...others, item].filter(
      (other) =>
        other.passFail &&
        (ACTIVE.has(other.status) || other.status === "failed") &&
        other.source !== "transfer" &&
        other.source !== "ap",
    );
    const { passFail } = resolveGraduationRules(catalogYearForTerm(context.firstTerm)).rules;
    if (elected.length > passFail.maxElected) {
      out.push({
        code: "pass-fail-total",
        message: `This makes ${elected.length} Pass/Fail courses; at most ${passFail.maxElected} may be elected Pass/Fail.`,
        ...ref,
      });
    }
    const sameTerm = elected.filter((other) => other.termCode === item.termCode);
    if (item.termCode && sameTerm.length > passFail.maxPerSemester) {
      out.push({
        code: "pass-fail-term",
        message: `This makes ${sameTerm.length} Pass/Fail courses in ${termLabel(item.termCode)}; at most ${passFail.maxPerSemester} per semester.`,
        ...ref,
      });
    }
  }

  if (section && active && item.termCode) {
    const neighbours = others.filter(
      (other) => other.termCode === item.termCode && other.crn && ACTIVE.has(other.status),
    );
    const sections = (
      await Promise.all(neighbours.map((other) => sectionForWarnings(item.termCode!, other.crn!)))
    ).filter((s): s is Section => s !== null);
    for (const conflict of detectConflictsImpl([section, ...sections])) {
      if (conflict.a.crn !== section.crn && conflict.b.crn !== section.crn) continue;
      const other = conflict.a.crn === section.crn ? conflict.b : conflict.a;
      out.push({
        code: "time-conflict",
        message: `${item.courseCode} ${section.section} overlaps ${other.courseCode} (CRN ${other.crn}) on ${conflictWindowLabel(conflict)}.`,
        ...ref,
      });
    }
  }
  return out;
}

function duplicateMessage(item: Pick<PlanItem, "courseCode" | "termCode">, existing?: PlanItem) {
  const as =
    existing && existing.courseCode !== item.courseCode ? ` as ${existing.courseCode}` : "";
  return `${item.courseCode} is already in ${item.termCode ? `your ${termLabel(item.termCode)} plan` : "your AP/transfer credit"}${as}.`;
}

/** Why an atomic add or patch did not match: the plan is full, or the key is taken. */
async function explainNoMatch(
  oid: mongoose.Types.ObjectId,
  item: PlanItem,
  checkFull: boolean,
): Promise<ApiError> {
  const items = itemsOf(await readPlanDoc(oid, { items: 1 }));
  if (checkFull && items.length >= MAX_PLAN_ITEMS) return planFull();
  return new ApiError(409, "conflict", duplicateMessage(item, takenBy(items, item)));
}

function planFull(): ApiError {
  return new ApiError(
    409,
    "conflict",
    `Your plan holds the maximum of ${MAX_PLAN_ITEMS} courses. Remove some before adding more.`,
  );
}

export function parseOr400<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "validation_failed",
      "Some fields are invalid.",
      zodIssues(parsed.error),
    );
  }
  return parsed.data;
}

export async function addItemImpl(userId: string, raw: AddPlanItemInput): Promise<AddItemResult> {
  const input = parseOr400(AddPlanItemBodySchema, raw);
  const oid = userObjectId(userId);
  const at = now();
  const context = await loadPlanContext(userId, at);
  checkTerm(context, input.termCode, input.source);
  if (input.crn && input.termCode === null) throw invalid("A CRN needs a term.", "crn");

  const typed = { courseCode: input.courseCode, canonicalCode: input.courseCode };
  const section = input.crn ? await sectionFor(input.termCode, input.crn, typed) : null;
  const facts = section
    ? factsFromSection(section)
    : await lookupCourse(input.termCode, input.courseCode);
  if (!facts && input.source === "ai-draft") {
    throw invalid(`${input.courseCode} is not in the Davidson course data.`, "courseCode");
  }
  const item: PlanItem = {
    id: newId(),
    termCode: input.termCode,
    courseCode: facts?.courseCode ?? input.courseCode,
    canonicalCode: facts?.canonicalCode ?? input.courseCode,
    title: facts ? facts.title : (input.manualTitle ?? input.courseCode),
    credits: facts ? facts.credits : (input.manualCredits ?? 1),
    ...(input.crn ? { crn: input.crn } : {}),
    status: input.status,
    passFail: input.passFail,
    source: facts ? input.source : input.source === "catalog" ? "manual" : input.source,
    reqCodes: facts?.reqCodes ?? null,
    unverified: !facts,
    ...(input.note ? { note: input.note } : {}),
  };

  const [{ items: others }, terms] = await Promise.all([currentItems(userId, oid), catalogTerms()]);
  // Answer a full plan or a taken key before anything is written (the update filter below stays the guard).
  if (others.length >= MAX_PLAN_ITEMS) throw planFull();
  const taken = ACTIVE.has(item.status) ? takenBy(others, item) : undefined;
  if (taken) throw new ApiError(409, "conflict", duplicateMessage(item, taken));
  const warnings = await itemWarnings({ item, facts, section, others, context, at, terms });

  await ensurePlanDoc(userId, oid, { create: true });
  const filter: Record<string, unknown> = {
    userId: oid,
    [`items.${MAX_PLAN_ITEMS - 1}`]: trusted({ $exists: false }),
  };
  if (ACTIVE.has(item.status)) {
    filter.items = trusted({
      $not: {
        $elemMatch: {
          termCode: item.termCode,
          canonicalCode: item.canonicalCode,
          status: { $in: ACTIVE_LIST },
        },
      },
    });
  }
  const updated = await Plan.findOneAndUpdate(
    filter,
    { $push: { items: itemToDoc(item, at) } },
    { returnDocument: "after", projection: { _id: 1 } },
  ).lean();
  if (!updated) throw await explainNoMatch(oid, item, true);
  return { item, warnings };
}

/** The facts an unchanged listing gives for warnings (best effort: the catalog is not needed for the change). */
async function factsForWarnings(
  item: PlanItem,
): Promise<{ facts: CourseFacts | null; section: Section | null; staleCrn: boolean }> {
  const none = { facts: null, section: null, staleCrn: false };
  if (item.unverified || !item.termCode) return none;
  try {
    if (item.crn) {
      const section = await lookupSection(item.termCode, item.crn);
      return section
        ? { facts: factsFromSection(section), section, staleCrn: false }
        : { ...none, staleCrn: true };
    }
    return { ...none, facts: await lookupCourse(item.termCode, item.courseCode) };
  } catch {
    return none;
  }
}

export async function updateItemImpl(
  userId: string,
  itemId: string,
  raw: UpdatePlanItemInput,
): Promise<AddItemResult> {
  const patch = parseOr400(UpdatePlanItemBodySchema, raw);
  const oid = userObjectId(userId);
  if (!mongoose.isValidObjectId(itemId)) throw notInPlan();
  const itemOid = new mongoose.Types.ObjectId(itemId);
  const at = now();
  const context = await loadPlanContext(userId, at);
  let terms: ResolvedTerms | null | undefined;
  const warningTerms = async () =>
    terms !== undefined ? terms : (terms = await catalogTerms().catch(() => null));
  const note = patch.note === undefined ? undefined : patch.note || null;

  for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
    const { items, stored } = await currentItems(userId, oid);
    const current = items.find((item) => item.id === itemId);
    if (!current) throw notInPlan();
    const others = items.filter((item) => item.id !== itemId);

    const termCode = patch.termCode !== undefined ? patch.termCode : current.termCode;
    const termChanged = termCode !== current.termCode;
    const storedCrn = current.crn ?? null;
    // The listing changes with a new CRN or a move (CRNs belong to one term: a move drops the CRN unless a new
    // one comes with it). Only then is the catalog asked, so a stored CRN that has since left the schedule never
    // blocks a status, P/F or note change.
    const relist = termChanged || (patch.crn !== undefined && patch.crn !== storedCrn);
    if (termChanged) checkTerm(context, termCode, current.source);
    const crn = patch.crn !== undefined ? patch.crn : termChanged ? null : storedCrn;

    let facts: CourseFacts | null = null;
    let section: Section | null = null;
    if (relist) {
      if (crn) {
        section = await sectionFor(termCode, crn, current);
        facts = factsFromSection(section);
      } else {
        facts = await lookupCourse(termCode, current.courseCode);
      }
    }

    const differs =
      relist ||
      (patch.status !== undefined && patch.status !== current.status) ||
      (patch.passFail !== undefined && patch.passFail !== current.passFail) ||
      (note !== undefined && note !== (current.note ?? null));
    if (!differs) {
      // Nothing to change: answer the item as it is (and write nothing, not even a legacy import).
      const found = await factsForWarnings(current);
      const warnings = await itemWarnings({
        item: current,
        ...found,
        others,
        context,
        at,
        terms: await warningTerms(),
      });
      return { item: current, warnings };
    }

    // Exactly the fields the patch names, plus the listing and its catalog facts when it changes.
    const field = (name: string) => `items.$[it].${name}`;
    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    if (patch.status !== undefined) set[field("status")] = patch.status;
    if (patch.passFail !== undefined) set[field("passFail")] = patch.passFail;
    if (note !== undefined) {
      if (note) set[field("note")] = note;
      else unset[field("note")] = "";
    }
    if (relist) {
      set[field("termCode")] = termCode;
      if (crn) set[field("crn")] = crn;
      else unset[field("crn")] = "";
      if (facts) {
        set[field("courseCode")] = facts.courseCode;
        set[field("canonicalCode")] = facts.canonicalCode;
        set[field("title")] = facts.title;
        set[field("credits")] = facts.credits;
        set[field("unverified")] = false;
        if (facts.reqCodes) set[field("reqCodes")] = facts.reqCodes;
        else unset[field("reqCodes")] = "";
      }
    }

    // Guard what the write was computed from: the key always; the listing (CRN, code) when facts are re-read; the
    // status when the key check below depends on it. A concurrent change there makes the update miss (retry).
    const guard: Record<string, unknown> = {
      _id: itemOid,
      termCode: current.termCode,
      canonicalCode: current.canonicalCode,
    };
    if (relist) {
      guard.courseCode = current.courseCode;
      guard.crn = storedCrn; // null also matches a missing field
    }
    const nextCanonical = relist && facts ? facts.canonicalCode : current.canonicalCode;
    const keyChanged = termChanged || nextCanonical !== current.canonicalCode;
    if (keyChanged && patch.status === undefined) guard.status = current.status;
    const nextStatus = patch.status ?? current.status;
    // "No other active item has the key": for a move, a change of listing key, or a status the patch sets.
    const keyCheck = ACTIVE.has(nextStatus) && (keyChanged || patch.status !== undefined);
    const filter: Record<string, unknown> = { userId: oid, items: trusted({ $elemMatch: guard }) };
    if (keyCheck) {
      filter.$nor = [
        {
          items: trusted({
            $elemMatch: {
              _id: { $ne: itemOid },
              termCode,
              canonicalCode: nextCanonical,
              status: { $in: ACTIVE_LIST },
            },
          }),
        },
      ];
    }
    const next: PlanItem = {
      ...current,
      termCode,
      courseCode: relist && facts ? facts.courseCode : current.courseCode,
      canonicalCode: nextCanonical,
      status: nextStatus,
    };
    const clash = keyCheck ? takenBy(others, next) : undefined;
    if (clash) throw new ApiError(409, "conflict", duplicateMessage(next, clash));

    // A legacy student's first real change writes v2 now (never earlier).
    if (!stored) await ensurePlanDoc(userId, oid, { create: false });
    const updated = await Plan.findOneAndUpdate(
      filter,
      {
        ...(Object.keys(set).length > 0 ? { $set: set } : {}),
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { arrayFilters: [{ "it._id": itemOid }], returnDocument: "after", projection: { items: 1 } },
    ).lean();
    if (updated) {
      const item = itemsOf(updated as Record<string, unknown>).find((entry) => entry.id === itemId);
      if (!item) throw notInPlan();
      const found = relist ? { facts, section, staleCrn: false } : await factsForWarnings(item);
      const warnings = await itemWarnings({
        item,
        ...found,
        others,
        context,
        at,
        terms: await warningTerms(),
      });
      return { item, warnings };
    }
    // Not matched: gone, the key is taken, or the item changed under us (then try again).
    const fresh = itemsOf(await readPlanDoc(oid, { items: 1 }));
    if (!fresh.some((item) => item.id === itemId)) throw notInPlan();
    const taken = keyCheck ? takenBy(fresh, next) : undefined;
    if (taken) throw new ApiError(409, "conflict", duplicateMessage(next, taken));
  }
  throw new ApiError(409, "conflict", "Your plan changed while saving. Please try again.");
}

export async function removeItemImpl(userId: string, itemId: string): Promise<void> {
  const oid = userObjectId(userId);
  if (!mongoose.isValidObjectId(itemId)) return;
  if (!(await readPlanDoc(oid, { _id: 1 }))) {
    // A legacy student's first real change writes v2 now; an id that is not in the plan writes nothing.
    const legacy = await readLegacyPlanImpl(userId);
    if (!legacy?.items.some((item) => item.id === itemId)) return;
    if (!(await ensurePlanDoc(userId, oid, { create: false }))) return;
  }
  await Plan.updateOne(
    { userId: oid },
    { $pull: { items: { _id: new mongoose.Types.ObjectId(itemId) } } },
  );
}
