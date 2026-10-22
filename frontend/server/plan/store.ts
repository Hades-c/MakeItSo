import "server-only";
import mongoose from "mongoose";
import {
  PlanDraftSchema,
  PlanItemSchema,
  StudentDeadlineSchema,
  SummerActivitySchema,
  WebTreeChoiceSchema,
  type PlanDraft,
  type PlanItem,
  type PlanView,
  type StudentDeadline,
  type SummerActivity,
  type WebTreeChoice,
} from "@/lib/types/plan";
import Plan from "@/models/Plan";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";
import { convertLegacyForUser } from "@/server/plan/legacy";

/**
 * The `plans` collection (models/Plan.ts) as the plan types (lib/types/plan.ts): document ↔ type mapping, and the
 * one place a v2 document is created. Every write elsewhere is a single atomic update on the student's document
 * (PLAN §5 "Plan items"); nothing reads, modifies and saves.
 */

export const MAX_PLAN_ITEMS = 200;
export const MAX_SUMMER_ACTIVITIES = 50;
export const MAX_DEADLINES = 200;
export const MAX_DRAFTS = 20;
/** WebTree lists kept (one per term; the oldest terms are dropped past this). */
export const MAX_WEBTREE_LISTS = 12;

export const DEFAULT_MANUAL: PlanView["manual"] = {
  languageExempt: false,
  pe: { lifetimeActivities: 0, teamSport: false },
};

type Raw = Record<string, unknown>;

function hex(value: unknown): string {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  return String(value ?? "");
}

function iso(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function logInvalid(kind: string, id: string, error: unknown): void {
  console.error(`[plan] stored ${kind} ${id} is invalid and was left out:`, error);
}

export function itemFromDoc(raw: Raw): PlanItem | null {
  const id = hex(raw._id);
  const parsed = PlanItemSchema.safeParse({
    id,
    termCode: raw.termCode ?? null,
    courseCode: raw.courseCode,
    canonicalCode: raw.canonicalCode,
    title: raw.title,
    credits: raw.credits,
    ...(typeof raw.crn === "string" && raw.crn ? { crn: raw.crn } : {}),
    status: raw.status,
    passFail: raw.passFail ?? false,
    source: raw.source ?? "catalog",
    reqCodes: Array.isArray(raw.reqCodes) && raw.reqCodes.length > 0 ? raw.reqCodes : null,
    unverified: raw.unverified ?? false,
    ...(typeof raw.note === "string" && raw.note ? { note: raw.note } : {}),
  });
  if (!parsed.success) {
    logInvalid("plan item", id, parsed.error);
    return null;
  }
  return parsed.data;
}

/** A PlanItem as a subdocument ($push / $setOnInsert); reqCodes absent when null. */
export function itemToDoc(item: PlanItem, addedAt: Date = now()): Raw {
  return {
    _id: new mongoose.Types.ObjectId(item.id),
    termCode: item.termCode,
    courseCode: item.courseCode,
    canonicalCode: item.canonicalCode,
    title: item.title,
    credits: item.credits,
    ...(item.crn ? { crn: item.crn } : {}),
    status: item.status,
    passFail: item.passFail,
    source: item.source,
    ...(item.reqCodes ? { reqCodes: item.reqCodes } : {}),
    unverified: item.unverified,
    ...(item.note ? { note: item.note } : {}),
    addedAt,
  };
}

export function summerFromDoc(raw: Raw): SummerActivity | null {
  const id = hex(raw._id);
  const parsed = SummerActivitySchema.safeParse({
    id,
    termCode: raw.termCode,
    title: raw.title,
    kind: raw.kind,
    ...(typeof raw.organization === "string" && raw.organization
      ? { organization: raw.organization }
      : {}),
    ...(typeof raw.note === "string" && raw.note ? { note: raw.note } : {}),
  });
  if (!parsed.success) {
    logInvalid("summer activity", id, parsed.error);
    return null;
  }
  return parsed.data;
}

export function summerToDoc(activity: SummerActivity): Raw {
  return {
    _id: new mongoose.Types.ObjectId(activity.id),
    termCode: activity.termCode,
    title: activity.title,
    kind: activity.kind,
    ...(activity.organization ? { organization: activity.organization } : {}),
    ...(activity.note ? { note: activity.note } : {}),
  };
}

export function deadlineFromDoc(raw: Raw): StudentDeadline | null {
  const id = hex(raw._id);
  const parsed = StudentDeadlineSchema.safeParse({
    id,
    title: raw.title,
    dueAt: iso(raw.dueAt),
    ...(typeof raw.courseCode === "string" && raw.courseCode ? { courseCode: raw.courseCode } : {}),
  });
  if (!parsed.success) {
    logInvalid("deadline", id, parsed.error);
    return null;
  }
  return parsed.data;
}

export function draftFromDoc(raw: Raw): PlanDraft | null {
  const id = hex(raw._id);
  const parsed = PlanDraftSchema.safeParse({
    id,
    kind: raw.kind,
    promptVersion: raw.promptVersion,
    items: Array.isArray(raw.items)
      ? (raw.items as Raw[]).map((item) => ({
          termCode: item.termCode,
          courseCode: item.courseCode,
          reason: item.reason,
          ...(item.basis ? { basis: item.basis } : {}),
        }))
      : [],
    status: raw.status,
    createdAt: iso(raw.createdAt),
  });
  if (!parsed.success) {
    logInvalid("draft", id, parsed.error);
    return null;
  }
  return parsed.data;
}

export function webtreeChoicesFromDoc(raw: unknown): WebTreeChoice[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((choice) => {
    const parsed = WebTreeChoiceSchema.safeParse(choice);
    return parsed.success ? [parsed.data] : [];
  });
}

function list<T>(value: unknown, map: (raw: Raw) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const mapped = map(raw as Raw);
    return mapped ? [mapped] : [];
  });
}

export function manualFromDoc(raw: unknown): PlanView["manual"] {
  const manual = (raw ?? {}) as { languageExempt?: unknown; pe?: Raw };
  const lifetime = Number(manual.pe?.lifetimeActivities ?? 0);
  return {
    languageExempt: manual.languageExempt === true,
    pe: {
      lifetimeActivities: Number.isInteger(lifetime) ? Math.min(2, Math.max(0, lifetime)) : 0,
      teamSport: manual.pe?.teamSport === true,
    },
  };
}

export function sortDeadlines(deadlines: StudentDeadline[]): StudentDeadline[] {
  return deadlines.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
}

export function sortSummer(activities: SummerActivity[]): SummerActivity[] {
  return activities.sort(
    (a, b) => a.termCode.localeCompare(b.termCode) || a.id.localeCompare(b.id),
  );
}

export function viewFromDoc(doc: Raw): PlanView {
  return {
    items: list(doc.items, itemFromDoc),
    summer: sortSummer(list(doc.summer, summerFromDoc)),
    deadlines: sortDeadlines(list(doc.deadlines, deadlineFromDoc)),
    manual: manualFromDoc(doc.manual),
    legacy: false,
    updatedAt: iso(doc.updatedAt),
  };
}

export function draftsFromDoc(doc: Raw | null): PlanDraft[] {
  return list(doc?.drafts, draftFromDoc).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
}

/** The student's v2 document (lean), or null. */
export async function readPlanDoc(
  userId: mongoose.Types.ObjectId,
  projection?: Record<string, 0 | 1>,
): Promise<Raw | null> {
  await getDb();
  return (await Plan.findOne({ userId }, projection).lean()) as Raw | null;
}

/**
 * Make sure the student has a v2 document before a change: if there is none, write one from the legacy v1 plan
 * (strict conversion: a catalog outage fails the change with 503 rather than persisting unverified guesses), or an
 * empty one when `create` (additive changes). `$setOnInsert` + upsert on the unique userId: a concurrent first
 * change writes the same document once; the loser's duplicate-key error is expected and ignored. Returns whether a
 * v2 document exists now.
 */
export async function ensurePlanDoc(
  userId: string,
  oid: mongoose.Types.ObjectId,
  { create }: { create: boolean },
): Promise<boolean> {
  await getDb();
  if (await Plan.exists({ userId: oid })) return true;
  const legacy = await convertLegacyForUser(userId, { strict: true });
  if (!legacy && !create) return false;
  const at = now();
  const insert: Raw = {
    version: 2,
    items: (legacy?.conversion.items ?? []).map((item) => itemToDoc(item, at)),
    summer: (legacy?.conversion.summer ?? []).map(summerToDoc),
  };
  if (legacy) {
    const source = legacy.conversion.sourceUpdatedAt;
    insert.importedFromLegacy = {
      at,
      sourceUpdatedAt: source ? new Date(source) : null,
      via: "first-mutation",
    };
  }
  try {
    await Plan.updateOne({ userId: oid }, { $setOnInsert: insert }, { upsert: true });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  return true;
}

export function newId(): string {
  return new mongoose.Types.ObjectId().toHexString();
}
