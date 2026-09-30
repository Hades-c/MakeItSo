import "server-only";
import mongoose from "mongoose";
import type { TermCode } from "@/lib/term";
import type { LegacyPlanConversion } from "@/lib/types/plan";
import CoursePlanV1 from "@/models/legacy/CoursePlanV1";
import { getDb } from "@/server/db";
import { lookupCourse } from "@/server/plan/catalog";
import {
  convertLegacyPlan,
  type LegacyCatalogLookup,
  type LegacyConversionResult,
  type LegacyDocument,
} from "@/server/plan/legacy-core";

/**
 * readLegacyPlan (PLAN §5): the student's v1 document in `courseplans`, converted in memory by
 * server/plan/legacy-core.ts with the live catalog. READ-ONLY on `courseplans` (models/legacy/CoursePlanV1.ts):
 * raw driver reads, never a write. The v2 document is written only by the student's first plan change
 * (server/plan/store.ts ensurePlanDoc), from a strict conversion.
 *
 * The view is cached per process for a few minutes, keyed by the v1 document's id and updatedAt, so the shell's
 * credit count and the plan pages do not convert on every request. A catalog outage while converting for the
 * view keeps the v1 title as unverified for that request (never cached); the write path fails instead (503), so
 * a degraded conversion is never persisted.
 */

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 200;

interface CacheEntry {
  key: string;
  at: number;
  result: LegacyConversionResult;
}

const cache = new Map<string, CacheEntry>();

/** Tests: forget the cached conversions. */
export function resetLegacyCache(): void {
  cache.clear();
}

/** The v1 filter: its userId was an ObjectId, but match the string form too (as the legacy eraser does). */
function legacyUserFilter(userId: string) {
  const ids: (string | mongoose.Types.ObjectId)[] = [userId];
  if (mongoose.isValidObjectId(userId)) ids.push(new mongoose.Types.ObjectId(userId));
  return { userId: { $in: ids } };
}

/** The student's most recent v1 document, or null. */
export async function findLegacyDocument(
  userId: string,
): Promise<(LegacyDocument & { _id?: unknown }) | null> {
  await getDb();
  const docs = await CoursePlanV1.collection
    .find(legacyUserFilter(userId))
    .sort({ updatedAt: -1, _id: -1 })
    .limit(1)
    .toArray();
  return (docs[0] as (LegacyDocument & { _id?: unknown }) | undefined) ?? null;
}

/** The catalog lookup the service uses (server/plan/catalog.ts lookupCourse). */
export function catalogLookup(options: {
  strict: boolean;
  failures?: unknown[];
}): LegacyCatalogLookup {
  return async (termCode: TermCode, code: string) => {
    try {
      const facts = await lookupCourse(termCode, code);
      return facts
        ? {
            courseCode: facts.courseCode,
            canonicalCode: facts.canonicalCode,
            title: facts.title,
            credits: facts.credits,
            reqCodes: facts.reqCodes,
          }
        : null;
    } catch (error) {
      if (options.strict) throw error;
      options.failures?.push(error);
      return null;
    }
  };
}

function cacheKey(doc: LegacyDocument & { _id?: unknown }): string {
  const id = String((doc._id as { toString?: () => string } | undefined)?.toString?.() ?? "");
  const updated = doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : String(doc.updatedAt);
  return `${id}:${updated}`;
}

/**
 * Convert the student's v1 plan. `strict` (the write path) lets a catalog failure propagate; otherwise the view
 * degrades (see the module comment).
 */
export async function convertLegacyForUser(
  userId: string,
  options: { strict: boolean },
): Promise<LegacyConversionResult | null> {
  const doc = await findLegacyDocument(userId);
  if (!doc) return null;
  const key = cacheKey(doc);
  const hit = cache.get(userId);
  if (hit && hit.key === key && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;
  const failures: unknown[] = [];
  const result = await convertLegacyPlan(doc, {
    userId,
    lookup: catalogLookup({ strict: options.strict, failures }),
  });
  if (failures.length > 0) {
    console.error(
      `[plan] catalog unavailable while converting a legacy plan (${failures.length} lookups):`,
      failures[0],
    );
    return result;
  }
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(userId, { key, at: Date.now(), result });
  return result;
}

export async function readLegacyPlanImpl(userId: string): Promise<LegacyPlanConversion | null> {
  return (await convertLegacyForUser(userId, { strict: false }))?.conversion ?? null;
}
