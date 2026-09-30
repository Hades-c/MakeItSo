import "server-only";
import type { AddPlanItemInput, UpdatePlanItemInput } from "@/lib/api/plan";
import type { TermCode } from "@/lib/term";
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
import { notImplemented } from "@/server/http/errors";

/**
 * Plan service (PLAN §4.1.4; owner W5s). FROZEN signatures: W5s replaces the bodies; until then every function
 * throws ApiError(501, "unavailable", "... is not implemented yet.").
 *
 * Storage: `plans` (models/Plan.ts, v2), written only on the student's first mutation; a legacy v1 document in
 * `courseplans` is read through readLegacyPlan() and never touched. Mutations are atomic (PLAN §5 "Plan items").
 * W5s registers the `plans` collection with registerAccountData (server/account/erasers.ts) in this module.
 * `userId` is the session user's id (24-hex string).
 */

export interface AddItemResult {
  item: PlanItem;
  /** e.g. "already-completed" for a retake, restriction flags; never a reason to block. */
  warnings: PlanWarning[];
}

/** The plan (v2, or the in-memory conversion of a v1 plan with `legacy: true`, or an empty plan). */
export async function getPlan(_userId: string): Promise<PlanView> {
  throw notImplemented("getPlan");
}

/** Add a course (409 conflict when the same (termCode, canonicalCode) is already active). */
export async function addItem(_userId: string, _input: AddPlanItemInput): Promise<AddItemResult> {
  throw notImplemented("addItem");
}

/** Patch whitelisted fields (404 when the item does not exist). */
export async function updateItem(
  _userId: string,
  _itemId: string,
  _patch: UpdatePlanItemInput,
): Promise<AddItemResult> {
  throw notImplemented("updateItem");
}

/** Remove an item by id (`$pull`; removing a missing id is a no-op). */
export async function removeItem(_userId: string, _itemId: string): Promise<void> {
  throw notImplemented("removeItem");
}

/** Degree progress (server/plan/requirements.ts rules, keyed by catalog year). */
export async function getProgress(
  _userId: string,
  _options: { now?: Date } = {},
): Promise<PlanProgress> {
  throw notImplemented("getProgress");
}

/** The student's classes on a date (America/New_York "YYYY-MM-DD"), for the Today timeline. */
export async function getDaySchedule(_userId: string, _date: string): Promise<DaySchedule> {
  throw notImplemented("getDaySchedule");
}

/** The ranked WebTree list for a term (empty list when none saved). */
export async function getWebTreeList(_userId: string, _termCode: TermCode): Promise<WebTreeList> {
  throw notImplemented("getWebTreeList");
}

/** Replace the ranked WebTree list for `list.termCode`. */
export async function saveWebTreeList(_userId: string, _list: WebTreeList): Promise<WebTreeList> {
  throw notImplemented("saveWebTreeList");
}

/**
 * Pure: every pair of sections whose non-TBA meetings overlap (second meeting times included); cross-listed
 * siblings are one class and never conflict with each other.
 */
export function detectConflicts(_sections: readonly ConflictInput[]): ScheduleConflict[] {
  throw notImplemented("detectConflicts");
}

/** Convert a legacy v1 plan in memory (PLAN §5 readLegacyPlan rules); null when the user has none. */
export async function readLegacyPlan(_userId: string): Promise<LegacyPlanConversion | null> {
  throw notImplemented("readLegacyPlan");
}

export async function listDeadlines(_userId: string): Promise<StudentDeadline[]> {
  throw notImplemented("listDeadlines");
}

export async function addDeadline(
  _userId: string,
  _input: Omit<StudentDeadline, "id">,
): Promise<StudentDeadline> {
  throw notImplemented("addDeadline");
}

export async function removeDeadline(_userId: string, _deadlineId: string): Promise<void> {
  throw notImplemented("removeDeadline");
}

export async function listSummerActivities(_userId: string): Promise<SummerActivity[]> {
  throw notImplemented("listSummerActivities");
}

export async function addSummerActivity(
  _userId: string,
  _input: Omit<SummerActivity, "id">,
): Promise<SummerActivity> {
  throw notImplemented("addSummerActivity");
}

export async function updateSummerActivity(
  _userId: string,
  _activityId: string,
  _patch: Partial<Omit<SummerActivity, "id">>,
): Promise<SummerActivity> {
  throw notImplemented("updateSummerActivity");
}

export async function removeSummerActivity(_userId: string, _activityId: string): Promise<void> {
  throw notImplemented("removeSummerActivity");
}

/** Language exemption / PE checklist. */
export async function updateManual(
  _userId: string,
  _patch: Partial<PlanView["manual"]>,
): Promise<PlanView["manual"]> {
  throw notImplemented("updateManual");
}

/** AI drafts stored for the student, newest first. */
export async function listDrafts(_userId: string): Promise<PlanDraft[]> {
  throw notImplemented("listDrafts");
}

/** Store a validated AI draft (W6 calls this). */
export async function saveDraft(
  _userId: string,
  _draft: Omit<PlanDraft, "id" | "createdAt" | "status">,
): Promise<PlanDraft> {
  throw notImplemented("saveDraft");
}

/** Accept (adds the draft's items that are not in the plan yet, per course) or dismiss a draft. */
export async function updateDraftStatus(
  _userId: string,
  _draftId: string,
  _status: "accepted" | "dismissed",
): Promise<{ draft: PlanDraft; added: PlanItem[] }> {
  throw notImplemented("updateDraftStatus");
}
