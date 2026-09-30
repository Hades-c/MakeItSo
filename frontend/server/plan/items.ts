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
import { isCompMet } from "@/server/plan/requirements";
import { courseRestrictionWarnings, sectionRestrictionWarnings } from "@/server/plan/restrictions";
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
 *   - patch:  $set through the filtered positional operator (items.$[it].field) on the whitelisted fields
 *             (termCode, crn, status, passFail, note) and the catalog facts they imply, guarded by the item's
 *             current key fields and, when the key changes, by "no other active item has the new key".
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

/** The student's items now (v2, else the legacy conversion, else none): the snapshot warnings are computed on. */
async function currentItems(userId: string, oid: mongoose.Types.ObjectId): Promise<PlanItem[]> {
  const doc = await readPlanDoc(oid, { items: 1 });
  if (doc) {
    return Array.isArray(doc.items)
      ? (doc.items as Record<string, unknown>[]).flatMap((raw) => itemFromDoc(raw) ?? [])
      : [];
  }
  return (await readLegacyPlanImpl(userId))?.items ?? [];
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
  terms: ResolvedTerms;
}

/** Warnings for an item as it would be stored (retake, restrictions, unverified, NSCI, P/F, time conflicts). */
async function itemWarnings(input: WarningInput): Promise<PlanWarning[]> {
  const { item, facts, section, others, context, at, terms } = input;
  const out: PlanWarning[] = [];
  const ref = { itemId: item.id, ...(item.termCode ? { termCode: item.termCode } : {}) };
  const active = ACTIVE.has(item.status);

  if (active) {
    const completed = others
      .filter(
        (other) =>
          other.status === "completed" &&
          other.termCode !== item.termCode &&
          sameCourse(other, item),
      )
      .sort((a, b) => (a.termCode ?? "").localeCompare(b.termCode ?? ""));
    const last = completed[completed.length - 1];
    if (last) {
      out.push({
        code: "already-completed",
        message: last.termCode
          ? `Already completed in ${termLabel(last.termCode)} — plan a retake?`
          : `Already counted as AP/transfer credit — plan a retake?`,
        ...ref,
      });
    }
  }

  if (REGISTERING.has(item.status) && item.termCode && facts?.sameTerm) {
    const restriction = {
      standing: standingForTerm(context, item.termCode, at),
      compMet: isCompMet(others, item.termCode),
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
  } else if (facts && !facts.sameTerm && item.termCode && isPublished(terms, item.termCode)) {
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
      await Promise.all(neighbours.map((other) => lookupSection(item.termCode!, other.crn!)))
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
  const doc = await readPlanDoc(oid, { items: 1 });
  const items = Array.isArray(doc?.items)
    ? (doc.items as Record<string, unknown>[]).flatMap((raw) => itemFromDoc(raw) ?? [])
    : [];
  if (checkFull && items.length >= MAX_PLAN_ITEMS) {
    return new ApiError(
      409,
      "conflict",
      `Your plan holds the maximum of ${MAX_PLAN_ITEMS} courses. Remove some before adding more.`,
    );
  }
  const existing = items.find(
    (other) =>
      other.id !== item.id &&
      other.termCode === item.termCode &&
      other.canonicalCode === item.canonicalCode &&
      ACTIVE.has(other.status),
  );
  return new ApiError(409, "conflict", duplicateMessage(item, existing));
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

  const [others, terms] = await Promise.all([currentItems(userId, oid), catalogTerms()]);
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

export async function updateItemImpl(
  userId: string,
  itemId: string,
  raw: UpdatePlanItemInput,
): Promise<AddItemResult> {
  const patch = parseOr400(UpdatePlanItemBodySchema, raw);
  const oid = userObjectId(userId);
  if (!mongoose.isValidObjectId(itemId))
    throw new ApiError(404, "not_found", "That course is not in your plan.");
  const itemOid = new mongoose.Types.ObjectId(itemId);
  const at = now();
  const context = await loadPlanContext(userId, at);
  if (!(await ensurePlanDoc(userId, oid, { create: false }))) {
    throw new ApiError(404, "not_found", "That course is not in your plan.");
  }
  const terms = await catalogTerms();

  for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
    const items = await currentItems(userId, oid);
    const current = items.find((item) => item.id === itemId);
    if (!current) throw new ApiError(404, "not_found", "That course is not in your plan.");
    const others = items.filter((item) => item.id !== itemId);

    const termCode = patch.termCode !== undefined ? patch.termCode : current.termCode;
    const termChanged = termCode !== current.termCode;
    if (termChanged) checkTerm(context, termCode, current.source);
    // CRNs belong to one term: moving an item drops its CRN unless a new one comes with the move.
    const crn = patch.crn !== undefined ? patch.crn : termChanged ? null : (current.crn ?? null);

    let facts: CourseFacts | null = null;
    let section: Section | null = null;
    if (crn) {
      section = await sectionFor(termCode, crn, current);
      facts = factsFromSection(section);
    } else if (termChanged || (current.crn && patch.crn === null)) {
      facts = await lookupCourse(termCode, current.courseCode);
    }
    const derived = facts
      ? {
          courseCode: facts.courseCode,
          canonicalCode: facts.canonicalCode,
          title: facts.title,
          credits: facts.credits,
          reqCodes: facts.reqCodes,
          unverified: false,
        }
      : {
          courseCode: current.courseCode,
          canonicalCode: current.canonicalCode,
          title: current.title,
          credits: current.credits,
          reqCodes: current.reqCodes,
          unverified: current.unverified,
        };
    const note = patch.note !== undefined ? patch.note || null : (current.note ?? null);
    const next: PlanItem = {
      id: current.id,
      termCode,
      ...derived,
      ...(crn ? { crn } : {}),
      status: patch.status ?? current.status,
      passFail: patch.passFail ?? current.passFail,
      source: current.source,
      ...(note ? { note } : {}),
    };
    if (!facts && !current.unverified && next.termCode) {
      // Unchanged listing: the facts for warnings (restrictions) come from the catalog as stored.
      section = next.crn ? await lookupSection(next.termCode, next.crn) : null;
      facts = section ? factsFromSection(section) : null;
    }

    const set: Record<string, unknown> = {
      "items.$[it].termCode": next.termCode,
      "items.$[it].courseCode": next.courseCode,
      "items.$[it].canonicalCode": next.canonicalCode,
      "items.$[it].title": next.title,
      "items.$[it].credits": next.credits,
      "items.$[it].status": next.status,
      "items.$[it].passFail": next.passFail,
      "items.$[it].unverified": next.unverified,
    };
    const unset: Record<string, ""> = {};
    if (next.crn) set["items.$[it].crn"] = next.crn;
    else unset["items.$[it].crn"] = "";
    if (next.note) set["items.$[it].note"] = next.note;
    else unset["items.$[it].note"] = "";
    if (next.reqCodes) set["items.$[it].reqCodes"] = next.reqCodes;
    else unset["items.$[it].reqCodes"] = "";

    const filter: Record<string, unknown> = {
      userId: oid,
      items: trusted({
        $elemMatch: {
          _id: itemOid,
          termCode: current.termCode,
          canonicalCode: current.canonicalCode,
          status: current.status,
        },
      }),
    };
    const keyChanged =
      next.termCode !== current.termCode || next.canonicalCode !== current.canonicalCode;
    if (ACTIVE.has(next.status) && (keyChanged || !ACTIVE.has(current.status))) {
      filter.$nor = [
        {
          items: trusted({
            $elemMatch: {
              _id: { $ne: itemOid },
              termCode: next.termCode,
              canonicalCode: next.canonicalCode,
              status: { $in: ACTIVE_LIST },
            },
          }),
        },
      ];
    }
    const result = await Plan.updateOne(
      filter,
      { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
      { arrayFilters: [{ "it._id": itemOid }] },
    );
    if (result.matchedCount === 1) {
      const warnings = await itemWarnings({
        item: next,
        facts,
        section,
        others,
        context,
        at,
        terms,
      });
      return { item: next, warnings };
    }
    // Not matched: gone, the new key is taken, or the item changed under us (then try again).
    const fresh = await currentItems(userId, oid);
    const stillThere = fresh.find((item) => item.id === itemId);
    if (!stillThere) throw new ApiError(404, "not_found", "That course is not in your plan.");
    const taken = fresh.find(
      (item) =>
        item.id !== itemId &&
        item.termCode === next.termCode &&
        item.canonicalCode === next.canonicalCode &&
        ACTIVE.has(item.status),
    );
    if (taken && ACTIVE.has(next.status)) {
      throw new ApiError(409, "conflict", duplicateMessage(next, taken));
    }
  }
  throw new ApiError(409, "conflict", "Your plan changed while saving. Please try again.");
}

export async function removeItemImpl(userId: string, itemId: string): Promise<void> {
  const oid = userObjectId(userId);
  if (!mongoose.isValidObjectId(itemId)) return;
  if (!(await ensurePlanDoc(userId, oid, { create: false }))) return;
  await Plan.updateOne(
    { userId: oid },
    { $pull: { items: { _id: new mongoose.Types.ObjectId(itemId) } } },
  );
}
