import "server-only";
import mongoose from "mongoose";
import CoursePlanV1 from "@/models/legacy/CoursePlanV1";
import User from "@/models/User";
import { getDb } from "@/server/db";

/**
 * Per-user data registry for "Download my data" and "Delete account" (PLAN §4.1.12). W3's `GET /api/me/export`
 * and `DELETE /api/me` call `exportAccountData` / `eraseAccountData`, which iterate every registration; each
 * workstream registers its own per-user collections, so nothing is forgotten when a collection is added.
 *
 *   // server/plan/index.ts (W5s), at module top level:
 *   registerAccountData("plans", {
 *     export: async (userId) => Plan.findOne({ userId }).lean(),
 *     erase: async (userId) => (await Plan.deleteMany({ userId })).deletedCount,
 *   });
 *
 * Registration happens when the registering module is evaluated, so every registering module must be listed in
 * ACCOUNT_DATA_MODULES below (the orchestrator adds entries on request). The users document itself is deleted by
 * W3 after the erasers ran.
 *
 * Built in: the student's own rows in the hackathon-era collections. Each runs only when that student exports or
 * deletes their own account, and erasing them on account deletion is the ONE permitted write to those collections.
 *   courseplans-legacy  the plan in `courseplans` (models/legacy/CoursePlanV1.ts), by userId.
 *   careergoals-legacy  the career goals in `careergoals`, by userId.
 *   aicaches-legacy     the personal AI answers in `aicaches`: the legacy routes keyed "roadmap", "career-plan" and
 *                       "recommendations" rows as JSON.stringify({ userId: <session id, else e-mail>, … }), so a
 *                       row is the student's when its cacheKey starts with {"userId":"<id>" or {"userId":"<e-mail>"
 *                       (the e-mail is read from the users document, which W3 deletes only after the erasers ran).
 * Not attributable, so not covered: legacy "cold-email" rows are keyed by the lower-cased student NAME only (names
 * are not unique: another student's drafts would match), and "course-insights" / "professor-summary" rows are
 * shared by everyone (no user in the key). `courses` is catalog data.
 */

export interface AccountDataHandler {
  /** JSON-serialisable copy of everything this collection holds for the user (null/[] when nothing). */
  export(userId: string): Promise<unknown>;
  /** Delete the user's data; returns how many documents (or entries) were removed. */
  erase(userId: string): Promise<number>;
}

/**
 * Modules that call registerAccountData at top level. W6 adds `() => import("@/server/ai")` when server/ai exists.
 */
const ACCOUNT_DATA_MODULES: ReadonlyArray<() => Promise<unknown>> = [
  () => import("@/server/auth"),
  () => import("@/server/plan"),
];

const registry = new Map<string, AccountDataHandler>();

/** The legacy plan's userId was an ObjectId; match the string form too in case an old writer stored one. */
function legacyUserFilter(userId: string) {
  const ids: (string | mongoose.Types.ObjectId)[] = [userId];
  if (mongoose.isValidObjectId(userId)) ids.push(new mongoose.Types.ObjectId(userId));
  return { userId: { $in: ids } };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Legacy AI answer types whose cache keys start with the student's userId (the per-student legacy routes). */
export const LEGACY_PERSONAL_AI_TYPES = ["roadmap", "career-plan", "recommendations"] as const;

/**
 * The student's rows in the legacy `aicaches`: a personal type whose cacheKey starts with {"userId":<id or e-mail>
 * as the legacy routes wrote it (JSON.stringify, so the value is JSON-quoted; the closing quote keeps
 * "sam@davidson.edu" from matching "sam@davidson.education").
 */
async function legacyAiCacheFilter(userId: string) {
  const owners = new Set<string>([userId]);
  if (mongoose.isValidObjectId(userId)) {
    const user = await User.findById(userId).select("email").lean();
    const email = typeof user?.email === "string" ? user.email.trim() : "";
    if (email) {
      owners.add(email);
      owners.add(email.toLowerCase());
    }
  }
  return {
    type: { $in: [...LEGACY_PERSONAL_AI_TYPES] },
    $or: [...owners].map((owner) => ({
      cacheKey: { $regex: `^${escapeRegExp(`{"userId":${JSON.stringify(owner)}`)}` },
    })),
  };
}

/** The legacy collections, through the raw driver: no mongoose casting or hooks, and the only writes are deletes. */
const legacyCollection = (name: "careergoals" | "aicaches") => mongoose.connection.collection(name);

/**
 * Registrations that belong to no service module. Raw driver calls: no mongoose casting or hooks on the legacy
 * collections, and the only write is the delete (models/legacy/CoursePlanV1.ts).
 */
const BUILT_IN: Readonly<Record<string, AccountDataHandler>> = {
  "courseplans-legacy": {
    async export(userId) {
      await getDb();
      return CoursePlanV1.collection.find(legacyUserFilter(userId)).toArray();
    },
    async erase(userId) {
      await getDb();
      return (await CoursePlanV1.collection.deleteMany(legacyUserFilter(userId))).deletedCount;
    },
  },
  "careergoals-legacy": {
    async export(userId) {
      await getDb();
      return legacyCollection("careergoals").find(legacyUserFilter(userId)).toArray();
    },
    async erase(userId) {
      await getDb();
      return (await legacyCollection("careergoals").deleteMany(legacyUserFilter(userId)))
        .deletedCount;
    },
  },
  "aicaches-legacy": {
    async export(userId) {
      await getDb();
      return legacyCollection("aicaches")
        .find(await legacyAiCacheFilter(userId))
        .toArray();
    },
    async erase(userId) {
      await getDb();
      const filter = await legacyAiCacheFilter(userId);
      return (await legacyCollection("aicaches").deleteMany(filter)).deletedCount;
    },
  },
};

/**
 * Register (or, on hot reload, replace) the handler for `name`. Names are unique per collection, e.g. "plans",
 * "verificationcodes", "aicache_v2", "aiusages".
 */
export function registerAccountData(name: string, handler: AccountDataHandler): void {
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) throw new TypeError(`Invalid account data name: ${name}`);
  registry.set(name, handler);
}

/** Registered names, sorted (for tests and the export's table of contents). */
export function accountDataNames(): string[] {
  return [...registry.keys()].sort();
}

/** Register the built-ins and import every registering module once (idempotent). */
export async function loadAccountDataRegistrations(): Promise<void> {
  for (const [name, handler] of Object.entries(BUILT_IN)) registry.set(name, handler);
  await Promise.all(ACCOUNT_DATA_MODULES.map((load) => load()));
}

/** Everything registered for the user, keyed by registration name. */
export async function exportAccountData(userId: string): Promise<Record<string, unknown>> {
  await loadAccountDataRegistrations();
  const out: Record<string, unknown> = {};
  for (const name of accountDataNames()) {
    out[name] = await registry.get(name)!.export(userId);
  }
  return out;
}

/**
 * Run every eraser (all of them, even after a failure) and return the removed counts by name. Throws an
 * AggregateError naming the failed registrations if any eraser failed, after the others ran.
 */
export async function eraseAccountData(userId: string): Promise<Record<string, number>> {
  await loadAccountDataRegistrations();
  const removed: Record<string, number> = {};
  const failures: Error[] = [];
  for (const name of accountDataNames()) {
    try {
      removed[name] = await registry.get(name)!.erase(userId);
    } catch (error) {
      failures.push(
        new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Could not erase: ${failures.map((f) => f.message).join("; ")}`,
    );
  }
  return removed;
}

/** Test helper: drop every registration. */
export function resetAccountDataRegistry(): void {
  registry.clear();
}
