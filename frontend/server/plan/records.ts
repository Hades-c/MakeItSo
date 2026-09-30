import "server-only";
import mongoose from "mongoose";
import {
  CreateDeadlineBodySchema,
  CreateSummerActivityBodySchema,
  UpdateManualBodySchema,
  UpdateSummerActivityBodySchema,
} from "@/lib/api/plan";
import { termLabel } from "@/lib/term";
import {
  PlanDraftSchema,
  type PlanDraft,
  type PlanItem,
  type PlanView,
  type StudentDeadline,
  type SummerActivity,
} from "@/lib/types/plan";
import Plan from "@/models/Plan";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { lookupCourse } from "@/server/plan/catalog";
import { loadPlanContext, userObjectId } from "@/server/plan/context";
import { addItemImpl, parseOr400 } from "@/server/plan/items";
import { readLegacyPlanImpl } from "@/server/plan/legacy";
import { isActiveItem } from "@/server/plan/requirements";
import {
  deadlineFromDoc,
  draftFromDoc,
  draftsFromDoc,
  ensurePlanDoc,
  itemFromDoc,
  manualFromDoc,
  MAX_DEADLINES,
  MAX_DRAFTS,
  MAX_SUMMER_ACTIVITIES,
  newId,
  readPlanDoc,
  sortDeadlines,
  sortSummer,
  summerFromDoc,
  summerToDoc,
} from "@/server/plan/store";
import { isInPlanRange, planRangeLabel } from "@/server/plan/terms";

/**
 * Summer activities, student deadlines, the manual requirement inputs and AI drafts (PLAN §5, §6.1 W5s). Every
 * write is one atomic update on the student's plan document; list sizes are bounded in the update filter.
 */

type Raw = Record<string, unknown>;

function notFound(what: string): ApiError {
  return new ApiError(404, "not_found", `That ${what} is not in your plan.`);
}

function objectId(id: string, what: string): mongoose.Types.ObjectId {
  if (!/^[a-f0-9]{24}$/.test(id)) throw notFound(what);
  return new mongoose.Types.ObjectId(id);
}

function rawList(doc: Raw | null, key: string): Raw[] {
  const value = doc?.[key];
  return Array.isArray(value) ? (value as Raw[]) : [];
}

// ---- Summer activities -----------------------------------------------------------------------------------------

export async function listSummerImpl(userId: string): Promise<SummerActivity[]> {
  const oid = userObjectId(userId);
  const doc = await readPlanDoc(oid, { summer: 1 });
  if (doc) return sortSummer(rawList(doc, "summer").flatMap((raw) => summerFromDoc(raw) ?? []));
  return (await readLegacyPlanImpl(userId))?.summer ?? [];
}

async function checkSummerTerm(userId: string, termCode: string): Promise<void> {
  const context = await loadPlanContext(userId, now());
  if (!isInPlanRange(context, termCode)) {
    throw new ApiError(
      400,
      "validation_failed",
      `${termLabel(termCode)} is outside your plan (${planRangeLabel(context)}).`,
      [{ path: "termCode", message: "outside your plan" }],
    );
  }
}

export async function addSummerImpl(
  userId: string,
  input: Omit<SummerActivity, "id">,
): Promise<SummerActivity> {
  const body = parseOr400(CreateSummerActivityBodySchema, input);
  const oid = userObjectId(userId);
  await checkSummerTerm(userId, body.termCode);
  const activity: SummerActivity = { id: newId(), ...body };
  await ensurePlanDoc(userId, oid, { create: true });
  const result = await Plan.updateOne(
    { userId: oid, [`summer.${MAX_SUMMER_ACTIVITIES - 1}`]: trusted({ $exists: false }) },
    { $push: { summer: summerToDoc(activity) } },
  );
  if (result.matchedCount !== 1) {
    throw new ApiError(
      409,
      "conflict",
      `Your plan holds the maximum of ${MAX_SUMMER_ACTIVITIES} summer entries.`,
    );
  }
  return activity;
}

export async function updateSummerImpl(
  userId: string,
  activityId: string,
  patch: Partial<Omit<SummerActivity, "id">>,
): Promise<SummerActivity> {
  const body = parseOr400(UpdateSummerActivityBodySchema, patch);
  const oid = userObjectId(userId);
  const id = objectId(activityId, "summer entry");
  if (body.termCode) await checkSummerTerm(userId, body.termCode);
  const set: Raw = {};
  const unset: Record<string, ""> = {};
  for (const key of ["termCode", "title", "kind", "organization", "note"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === "" && (key === "organization" || key === "note"))
      unset[`summer.$[s].${key}`] = "";
    else set[`summer.$[s].${key}`] = value;
  }
  const changes = Object.keys(set).length + Object.keys(unset).length;
  const stored = await readPlanDoc(oid, { summer: 1 });
  if (!stored) {
    // Only the in-memory legacy view: the entry must be in it, and v2 is written only for a real change.
    const legacy = (await readLegacyPlanImpl(userId))?.summer ?? [];
    const entry = legacy.find((activity) => activity.id === activityId);
    if (!entry) throw notFound("summer entry");
    if (changes === 0) return entry;
    if (!(await ensurePlanDoc(userId, oid, { create: false }))) throw notFound("summer entry");
  } else if (changes === 0) {
    // Nothing to change (an empty patch): answer the entry as it is.
    const raw = rawList(stored, "summer").find((entry) => String(entry._id) === activityId);
    const activity = raw ? summerFromDoc(raw) : null;
    if (!activity) throw notFound("summer entry");
    return activity;
  }
  const updated = await Plan.findOneAndUpdate(
    { userId: oid, "summer._id": id },
    {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
    { arrayFilters: [{ "s._id": id }], returnDocument: "after", projection: { summer: 1 } },
  ).lean();
  const raw = rawList(updated as Raw | null, "summer").find(
    (entry) => String(entry._id) === activityId,
  );
  const activity = raw ? summerFromDoc(raw) : null;
  if (!activity) throw notFound("summer entry");
  return activity;
}

export async function removeSummerImpl(userId: string, activityId: string): Promise<void> {
  const oid = userObjectId(userId);
  if (!/^[a-f0-9]{24}$/.test(activityId)) return;
  if (!(await readPlanDoc(oid, { _id: 1 }))) {
    // A legacy student's first real change writes v2 now; an id that is not in the plan writes nothing.
    const legacy = (await readLegacyPlanImpl(userId))?.summer ?? [];
    if (!legacy.some((activity) => activity.id === activityId)) return;
    if (!(await ensurePlanDoc(userId, oid, { create: false }))) return;
  }
  await Plan.updateOne(
    { userId: oid },
    { $pull: { summer: { _id: new mongoose.Types.ObjectId(activityId) } } },
  );
}

// ---- Student deadlines -----------------------------------------------------------------------------------------

export async function listDeadlinesImpl(userId: string): Promise<StudentDeadline[]> {
  const doc = await readPlanDoc(userObjectId(userId), { deadlines: 1 });
  return sortDeadlines(rawList(doc, "deadlines").flatMap((raw) => deadlineFromDoc(raw) ?? []));
}

export async function addDeadlineImpl(
  userId: string,
  input: Omit<StudentDeadline, "id">,
): Promise<StudentDeadline> {
  const body = parseOr400(CreateDeadlineBodySchema, input);
  const oid = userObjectId(userId);
  const deadline: StudentDeadline = {
    id: newId(),
    title: body.title,
    dueAt: new Date(body.dueAt).toISOString(),
    ...(body.courseCode ? { courseCode: body.courseCode } : {}),
  };
  await ensurePlanDoc(userId, oid, { create: true });
  const result = await Plan.updateOne(
    { userId: oid, [`deadlines.${MAX_DEADLINES - 1}`]: trusted({ $exists: false }) },
    {
      $push: {
        deadlines: {
          _id: new mongoose.Types.ObjectId(deadline.id),
          title: deadline.title,
          dueAt: new Date(deadline.dueAt),
          ...(deadline.courseCode ? { courseCode: deadline.courseCode } : {}),
        },
      },
    },
  );
  if (result.matchedCount !== 1) {
    throw new ApiError(409, "conflict", `You can keep at most ${MAX_DEADLINES} deadlines.`);
  }
  return deadline;
}

export async function removeDeadlineImpl(userId: string, deadlineId: string): Promise<void> {
  const oid = userObjectId(userId);
  if (!/^[a-f0-9]{24}$/.test(deadlineId)) return;
  // Deadlines exist only in v2 (a legacy plan has none): without a document there is nothing to remove.
  await getDb();
  await Plan.updateOne(
    { userId: oid },
    { $pull: { deadlines: { _id: new mongoose.Types.ObjectId(deadlineId) } } },
  );
}

// ---- Manual requirement inputs ---------------------------------------------------------------------------------

export async function updateManualImpl(
  userId: string,
  patch: Partial<PlanView["manual"]>,
): Promise<PlanView["manual"]> {
  const body = parseOr400(UpdateManualBodySchema, patch);
  const oid = userObjectId(userId);
  const set: Raw = {};
  if (body.languageExempt !== undefined) set["manual.languageExempt"] = body.languageExempt;
  if (body.pe !== undefined) {
    set["manual.pe.lifetimeActivities"] = body.pe.lifetimeActivities;
    set["manual.pe.teamSport"] = body.pe.teamSport;
  }
  if (Object.keys(set).length === 0) {
    // Nothing to change (an empty patch): answer the inputs as they are, writing nothing.
    return manualFromDoc((await readPlanDoc(oid, { manual: 1 }))?.manual);
  }
  await ensurePlanDoc(userId, oid, { create: true });
  const updated = await Plan.findOneAndUpdate(
    { userId: oid },
    { $set: set },
    { returnDocument: "after", projection: { manual: 1 } },
  ).lean();
  return manualFromDoc((updated as Raw | null)?.manual);
}

// ---- AI drafts ---------------------------------------------------------------------------------------------------

const DraftInputSchema = PlanDraftSchema.omit({ id: true, createdAt: true, status: true }).strict();

export async function listDraftsImpl(userId: string): Promise<PlanDraft[]> {
  return draftsFromDoc(await readPlanDoc(userObjectId(userId), { drafts: 1 }));
}

/** Store a validated AI draft (W6); the newest MAX_DRAFTS are kept. A ZodError here is W6's bug (500). */
export async function saveDraftImpl(
  userId: string,
  input: Omit<PlanDraft, "id" | "createdAt" | "status">,
): Promise<PlanDraft> {
  const body = DraftInputSchema.parse(input);
  const oid = userObjectId(userId);
  const draft: PlanDraft = {
    id: newId(),
    ...body,
    status: "pending",
    createdAt: now().toISOString(),
  };
  await ensurePlanDoc(userId, oid, { create: true });
  await Plan.updateOne(
    { userId: oid },
    {
      $push: {
        drafts: {
          $each: [
            {
              _id: new mongoose.Types.ObjectId(draft.id),
              kind: draft.kind,
              promptVersion: draft.promptVersion,
              items: draft.items,
              status: draft.status,
              createdAt: new Date(draft.createdAt),
            },
          ],
          $slice: -MAX_DRAFTS,
        },
      },
    },
  );
  return draft;
}

function sameCourseCode(item: PlanItem, code: string, canonical: string): boolean {
  return (
    item.courseCode === code ||
    item.canonicalCode === code ||
    item.courseCode === canonical ||
    item.canonicalCode === canonical
  );
}

/**
 * Accept or dismiss a draft: a one-way transition from "pending", claimed atomically before anything else
 * (`$elemMatch: { _id, status: "pending" }`), so a double-submitted or replayed Accept, or an Accept after a
 * Dismiss, answers 409 and never re-adds courses the student has removed since. Accepting then adds, through the
 * same validated add as any other (source "ai-draft", status planned), each draft course that is not in the plan
 * yet — per course, in any term, never hiding a whole term; a course that cannot be added (outside the plan's
 * terms, no longer in the catalog, taken meanwhile) is left out of `added`. If the adds fail for another reason
 * (the catalog is down), the draft goes back to "pending" so it can be accepted again. The student can also
 * accept course by course with POST /api/plan/items.
 */
export async function updateDraftStatusImpl(
  userId: string,
  draftId: string,
  status: "accepted" | "dismissed",
): Promise<{ draft: PlanDraft; added: PlanItem[] }> {
  const oid = userObjectId(userId);
  const id = objectId(draftId, "draft");
  await getDb();
  const claimed = await Plan.findOneAndUpdate(
    { userId: oid, drafts: trusted({ $elemMatch: { _id: id, status: "pending" } }) },
    { $set: { "drafts.$.status": status } },
    { returnDocument: "before", projection: { drafts: 1, items: 1 } },
  ).lean();
  if (!claimed) {
    const doc = await readPlanDoc(oid, { drafts: 1 });
    const raw = rawList(doc, "drafts").find((entry) => String(entry._id) === draftId);
    const existing = raw ? draftFromDoc(raw) : null;
    if (!existing) throw notFound("draft");
    throw new ApiError(409, "conflict", `This draft was already ${existing.status}.`);
  }
  const raw = rawList(claimed as Raw, "drafts").find((entry) => String(entry._id) === draftId);
  const draft = raw ? draftFromDoc(raw) : null;
  if (!draft) throw notFound("draft");

  const added: PlanItem[] = [];
  if (status === "accepted") {
    try {
      const planItems = rawList(claimed as Raw, "items")
        .flatMap((entry) => itemFromDoc(entry) ?? [])
        .filter(isActiveItem);
      for (const entry of draft.items) {
        const facts = await lookupCourse(entry.termCode, entry.courseCode);
        const canonical = facts?.canonicalCode ?? entry.courseCode;
        const known = [...planItems, ...added];
        if (known.some((item) => sameCourseCode(item, entry.courseCode, canonical))) continue;
        try {
          const result = await addItemImpl(userId, {
            termCode: entry.termCode,
            courseCode: entry.courseCode,
            status: "planned",
            passFail: false,
            source: "ai-draft",
          });
          added.push(result.item);
        } catch (error) {
          if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 409)) {
            throw error;
          }
        }
      }
    } catch (error) {
      await Plan.updateOne(
        { userId: oid, drafts: trusted({ $elemMatch: { _id: id, status: "accepted" } }) },
        { $set: { "drafts.$.status": "pending" } },
      ).catch((revertError: unknown) => {
        console.error(`[plan] draft ${draftId} could not go back to pending:`, revertError);
      });
      throw error;
    }
  }
  return { draft: { ...draft, status }, added };
}
