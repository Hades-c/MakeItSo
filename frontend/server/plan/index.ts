import "server-only";
import mongoose from "mongoose";
import type { AddPlanItemInput, UpdatePlanItemInput } from "@/lib/api/plan";
import { isTermCode, type TermCode } from "@/lib/term";
import type { ResolvedTerms } from "@/lib/types/catalog";
import type {
  ConflictInput,
  DaySchedule,
  LegacyPlanConversion,
  PlanDraft,
  PlanItem,
  PlanProgress,
  PlanView,
  PlanWarning,
  ScheduleConflict,
  StudentDeadline,
  SummerActivity,
  WebTreeList,
} from "@/lib/types/plan";
import Plan from "@/models/Plan";
import { registerAccountData } from "@/server/account/erasers";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { catalogTerms } from "@/server/plan/catalog";
import { detectConflictsImpl } from "@/server/plan/conflicts";
import { loadPlanContext, userObjectId } from "@/server/plan/context";
import { addItemImpl, removeItemImpl, updateItemImpl } from "@/server/plan/items";
import { readLegacyPlanImpl } from "@/server/plan/legacy";
import {
  addDeadlineImpl,
  addSummerImpl,
  listDeadlinesImpl,
  listDraftsImpl,
  listSummerImpl,
  removeDeadlineImpl,
  removeSummerImpl,
  saveDraftImpl,
  updateDraftStatusImpl,
  updateManualImpl,
  updateSummerImpl,
} from "@/server/plan/records";
import { evaluateRequirements, type RequirementsReport } from "@/server/plan/requirements";
import { buildDaySchedule, type DayScheduleResult } from "@/server/plan/schedule";
import { DEFAULT_MANUAL, readPlanDoc, viewFromDoc } from "@/server/plan/store";
import { isDateKey } from "@/server/plan/time";
import {
  buildWebTreeReport,
  readWebTreeList,
  validateWebTreeList,
  writeWebTreeList,
  type WebTreeReport,
} from "@/server/plan/webtree";

/**
 * Plan service (PLAN §4.1.4, §5 "Credits & requirements", "Plan items", "WebTree list"; owner W5s). The frozen
 * signatures below, plus getPlanCredits (the shell's "My plan x/32") and getWebTreeReport (the Next semester tab).
 *
 * Storage: `plans` (models/Plan.ts, v2), written only on the student's first change; a legacy v1 document in
 * `courseplans` is converted in memory by readLegacyPlan() and never touched. Mutations are atomic (see
 * server/plan/items.ts). `userId` is the session user's id (24-hex string).
 *
 * Modules: items (add/update/remove), requirements (the pure engine), conflicts, restrictions, webtree, schedule,
 * records (summer, deadlines, manual inputs, drafts), legacy + legacy-core (v1 conversion), catalog (the facts a
 * plan item takes from server/catalog), context + terms (profile, term range, standing), store (documents).
 */

export interface AddItemResult {
  /** The item as stored. */
  item: PlanItem;
  /** e.g. "already-completed" for a retake, restriction flags; never a reason to block. */
  warnings: PlanWarning[];
}

export type { DayScheduleResult, RequirementsReport, WebTreeReport };
export type {
  WebTreeChoiceDetail,
  WebTreeSeats,
  WebTreeSectionDetail,
} from "@/server/plan/webtree";

/** The plan (v2, or the in-memory conversion of a v1 plan with `legacy: true`, or an empty plan). */
export async function getPlan(userId: string): Promise<PlanView> {
  const doc = await readPlanDoc(userObjectId(userId), { drafts: 0, webtree: 0 });
  if (doc) return viewFromDoc(doc);
  const legacy = await readLegacyPlanImpl(userId);
  return {
    items: legacy?.items ?? [],
    summer: legacy?.summer ?? [],
    deadlines: [],
    manual: DEFAULT_MANUAL,
    legacy: legacy !== null,
    updatedAt: null,
  };
}

/** Add a course (409 conflict when the same (termCode, canonicalCode) is already active). */
export async function addItem(userId: string, input: AddPlanItemInput): Promise<AddItemResult> {
  return addItemImpl(userId, input);
}

/** Patch whitelisted fields (404 when the item does not exist). */
export async function updateItem(
  userId: string,
  itemId: string,
  patch: UpdatePlanItemInput,
): Promise<AddItemResult> {
  return updateItemImpl(userId, itemId, patch);
}

/** Remove an item by id (`$pull`; removing a missing id is a no-op). */
export async function removeItem(userId: string, itemId: string): Promise<void> {
  return removeItemImpl(userId, itemId);
}

/** The current term for warnings; undefined (the date rules) when the catalog cannot answer. */
async function currentTerm(): Promise<TermCode | undefined> {
  try {
    return (await catalogTerms()).current;
  } catch {
    return undefined;
  }
}

/**
 * Degree progress (server/plan/requirements.ts rules, keyed by catalog year). The value is a PlanProgress plus the
 * engine's extras (disclaimer, catalogYear, rulesExact, alsoTagged): see RequirementsReport.
 */
export async function getProgress(
  userId: string,
  options: { now?: Date } = {},
): Promise<PlanProgress> {
  const at = options.now ?? now();
  const [plan, context, current] = await Promise.all([
    getPlan(userId),
    loadPlanContext(userId, at),
    currentTerm(),
  ]);
  const report: RequirementsReport = evaluateRequirements({
    items: plan.items,
    manual: plan.manual,
    firstTerm: context.firstTerm,
    now: at,
    currentTerm: current,
  });
  return report;
}

/**
 * Credits for the shell's sidebar ("My plan x/32"): done and planned (done + in progress + planned), counted as
 * getProgress counts them, without the catalog's term resolver.
 */
export async function getPlanCredits(
  userId: string,
): Promise<{ done: number; planned: number; required: 32 }> {
  const at = now();
  const [plan, context] = await Promise.all([getPlan(userId), loadPlanContext(userId, at)]);
  const report = evaluateRequirements({
    items: plan.items,
    manual: plan.manual,
    firstTerm: context.firstTerm,
    now: at,
  });
  return { done: report.creditsDone, planned: report.creditsPlanned, required: 32 };
}

/**
 * The student's classes on a date (America/New_York "YYYY-MM-DD"), for the Today timeline. The value is a
 * DaySchedule plus `deadlines`, the student-entered deadlines due that day: see DayScheduleResult.
 */
export async function getDaySchedule(userId: string, date: string): Promise<DaySchedule> {
  if (!isDateKey(date)) {
    throw new ApiError(400, "validation_failed", "That is not a date such as 2026-09-30.");
  }
  const [plan, terms] = await Promise.all([getPlan(userId), catalogTerms()]);
  const schedule: DayScheduleResult = await buildDaySchedule({
    date,
    items: plan.items,
    deadlines: plan.deadlines,
    terms,
  });
  return schedule;
}

function assertTermCode(termCode: string): void {
  if (!isTermCode(termCode)) {
    throw new ApiError(400, "validation_failed", "That is not a term code such as 202602.");
  }
}

/** The ranked WebTree list for a term (empty list when none saved). */
export async function getWebTreeList(userId: string, termCode: TermCode): Promise<WebTreeList> {
  assertTermCode(termCode);
  return readWebTreeList(userObjectId(userId), termCode);
}

/** Replace the ranked WebTree list for `list.termCode` (400 with per-choice issues when invalid). */
export async function saveWebTreeList(userId: string, list: WebTreeList): Promise<WebTreeList> {
  const oid = userObjectId(userId);
  const valid = await validateWebTreeList(list);
  await writeWebTreeList(userId, oid, valid);
  return valid;
}

/**
 * The WebTree list for a term (default: the registration term) with its checks: conflicts across choices and
 * alternates, warnings (restriction flags, sections no longer offered, retakes), per-choice details (seats, slots,
 * flags), the "Copy for WebTree" text and the registration deadlines. `list` reports an unsaved list.
 */
export async function getWebTreeReport(
  userId: string,
  termCode?: TermCode,
  options: { list?: WebTreeList; terms?: ResolvedTerms } = {},
): Promise<WebTreeReport> {
  const oid = userObjectId(userId);
  const at = now();
  const terms = options.terms ?? (await catalogTerms());
  const term = termCode ?? options.list?.termCode ?? terms.registration;
  assertTermCode(term);
  const [list, plan, context] = await Promise.all([
    options.list ? Promise.resolve(options.list) : readWebTreeList(oid, term),
    getPlan(userId),
    loadPlanContext(userId, at),
  ]);
  const progress = evaluateRequirements({
    items: plan.items,
    manual: plan.manual,
    firstTerm: context.firstTerm,
    now: at,
    currentTerm: terms.current,
  });
  return buildWebTreeReport({ list, items: plan.items, progress, context, at, terms });
}

/**
 * Pure: every pair of sections whose non-TBA meetings overlap (second meeting times included); cross-listed
 * siblings are one class and never conflict with each other.
 */
export function detectConflicts(sections: readonly ConflictInput[]): ScheduleConflict[] {
  return detectConflictsImpl(sections);
}

/** Convert a legacy v1 plan in memory (PLAN §5 readLegacyPlan rules); null when the user has none. */
export async function readLegacyPlan(userId: string): Promise<LegacyPlanConversion | null> {
  if (!mongoose.isValidObjectId(userId)) return null;
  return readLegacyPlanImpl(userId);
}

export async function listDeadlines(userId: string): Promise<StudentDeadline[]> {
  return listDeadlinesImpl(userId);
}

export async function addDeadline(
  userId: string,
  input: Omit<StudentDeadline, "id">,
): Promise<StudentDeadline> {
  return addDeadlineImpl(userId, input);
}

export async function removeDeadline(userId: string, deadlineId: string): Promise<void> {
  return removeDeadlineImpl(userId, deadlineId);
}

export async function listSummerActivities(userId: string): Promise<SummerActivity[]> {
  return listSummerImpl(userId);
}

export async function addSummerActivity(
  userId: string,
  input: Omit<SummerActivity, "id">,
): Promise<SummerActivity> {
  return addSummerImpl(userId, input);
}

export async function updateSummerActivity(
  userId: string,
  activityId: string,
  patch: Partial<Omit<SummerActivity, "id">>,
): Promise<SummerActivity> {
  return updateSummerImpl(userId, activityId, patch);
}

export async function removeSummerActivity(userId: string, activityId: string): Promise<void> {
  return removeSummerImpl(userId, activityId);
}

/** Language exemption / PE checklist. */
export async function updateManual(
  userId: string,
  patch: Partial<PlanView["manual"]>,
): Promise<PlanView["manual"]> {
  return updateManualImpl(userId, patch);
}

/** AI drafts stored for the student, newest first. */
export async function listDrafts(userId: string): Promise<PlanDraft[]> {
  return listDraftsImpl(userId);
}

/** Store a validated AI draft (W6 calls this). */
export async function saveDraft(
  userId: string,
  draft: Omit<PlanDraft, "id" | "createdAt" | "status">,
): Promise<PlanDraft> {
  return saveDraftImpl(userId, draft);
}

/** Accept (adds the draft's items that are not in the plan yet, per course) or dismiss a draft. */
export async function updateDraftStatus(
  userId: string,
  draftId: string,
  status: "accepted" | "dismissed",
): Promise<{ draft: PlanDraft; added: PlanItem[] }> {
  return updateDraftStatusImpl(userId, draftId, status);
}

// ---- Account data (PLAN §4.1.12): "Download my data" and "Delete account" ---------------------------------------

function planOwner(userId: string): mongoose.Types.ObjectId | null {
  return /^[a-f0-9]{24}$/.test(userId) && mongoose.isValidObjectId(userId)
    ? new mongoose.Types.ObjectId(userId)
    : null;
}

registerAccountData("plans", {
  async export(userId) {
    const owner = planOwner(userId);
    if (!owner) return null;
    await getDb();
    return Plan.findOne({ userId: owner }).lean();
  },
  async erase(userId) {
    const owner = planOwner(userId);
    if (!owner) return 0;
    await getDb();
    return (await Plan.deleteMany({ userId: owner })).deletedCount;
  },
});
