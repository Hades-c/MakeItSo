import "server-only";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type { AiFeature, AiProvenance } from "@/lib/types/ai";
import AiCache from "@/models/AiCache";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";

/**
 * aicache_v2 access (models/AiCache.ts). Shared entries (course-about, professor-summary) are keyed only by what
 * the server derived from official data, so no student can change what another student receives; personal entries
 * are keyed by the student's id. Reads ignore expired entries (the TTL monitor deletes them within a minute or so),
 * except hidden ones: a shared entry hidden by reports is returned as hidden whatever its validUntil, is kept
 * (its expiresAt moves a year ahead when it is hidden: server/ai/reports.ts), and is never overwritten by a
 * write; only the admin purge removes it.
 */

/** JSON with object keys sorted at every level, so equal inputs hash equally whatever their key order. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** sha256 (hex) of the stable JSON of `value`. */
export function hashInput(value: unknown): string {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

export type EntryStatus = "ok" | "refused" | "invalid";

export interface CacheEntry<T> {
  status: EntryStatus;
  data: T | null;
  message: string | null;
  inputHash: string;
  provenance: AiProvenance;
  fallbackUsed: boolean;
  hidden: boolean;
  reports: number;
  validUntil: Date;
}

interface StoredEntry {
  status?: string;
  data?: unknown;
  message?: string | null;
  inputHash: string;
  provenance: { model: string; promptVersion: string; inputHash: string; generatedAt: Date };
  fallbackUsed?: boolean | null;
  hidden?: boolean | null;
  reports?: { userIds?: unknown[] | null } | null;
  validUntil: Date;
}

function toEntry<T>(doc: StoredEntry | null, at: Date): CacheEntry<T> | null {
  if (!doc || !(doc.validUntil instanceof Date)) return null;
  // A hidden entry stays hidden until an admin purges it, even past its own lifetime.
  if (doc.hidden !== true && doc.validUntil.getTime() <= at.getTime()) return null;
  const status: EntryStatus =
    doc.status === "refused" || doc.status === "invalid" ? doc.status : "ok";
  return {
    status,
    data: (doc.data ?? null) as T | null,
    message: doc.message ?? null,
    inputHash: doc.inputHash,
    provenance: {
      model: doc.provenance.model,
      promptVersion: doc.provenance.promptVersion,
      inputHash: doc.provenance.inputHash,
      generatedAt: doc.provenance.generatedAt.toISOString(),
    },
    fallbackUsed: doc.fallbackUsed ?? false,
    hidden: doc.hidden ?? false,
    reports: doc.reports?.userIds?.length ?? 0,
    validUntil: doc.validUntil,
  };
}

function objectId(userId: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(userId);
}

export async function readShared<T>(
  feature: AiFeature,
  key: string,
): Promise<CacheEntry<T> | null> {
  await getDb();
  const doc = await AiCache.findOne({ feature, scope: "shared", userId: null, key }).lean();
  return toEntry<T>(doc as StoredEntry | null, now());
}

export async function readPersonal<T>(
  feature: AiFeature,
  userId: string,
  key: string,
): Promise<CacheEntry<T> | null> {
  await getDb();
  const doc = await AiCache.findOne({
    feature,
    scope: "user",
    userId: objectId(userId),
    key,
  }).lean();
  return toEntry<T>(doc as StoredEntry | null, now());
}

export interface EntryWrite {
  inputHash: string;
  promptVersion: string;
  status: EntryStatus;
  data: unknown;
  message?: string | null;
  servedModel: string;
  fallbackUsed: boolean;
  ttlMs: number;
}

async function write(
  filter: {
    feature: AiFeature;
    scope: "shared" | "user";
    userId: mongoose.Types.ObjectId | null;
    key: string;
  },
  entry: EntryWrite,
): Promise<AiProvenance | null> {
  await getDb();
  const at = now();
  const validUntil = new Date(at.getTime() + entry.ttlMs);
  const set = {
    inputHash: entry.inputHash,
    promptVersion: entry.promptVersion,
    status: entry.status,
    data: entry.data ?? null,
    message: entry.message ?? null,
    provenance: {
      model: entry.servedModel,
      promptVersion: entry.promptVersion,
      inputHash: entry.inputHash,
      generatedAt: at,
    },
    fallbackUsed: entry.fallbackUsed,
    validUntil,
    // Purge time: never before the real clock plus the lifetime (FIXTURES_NOW may be pinned in the past).
    expiresAt: new Date(Math.max(validUntil.getTime(), Date.now() + entry.ttlMs)),
  };
  // A hidden document never matches, so the upsert collides with it on the unique key and the update after the
  // collision matches nothing: the hidden entry is left as it is.
  const unlessHidden = { ...filter, hidden: trusted({ $ne: true }) };
  try {
    await AiCache.updateOne(unlessHidden, { $set: set }, { upsert: true });
  } catch (error) {
    // Two first writers can race on the upsert (the loser writes as an update), or the entry is hidden.
    if (!isDuplicateKeyError(error)) throw error;
    const result = await AiCache.updateOne(unlessHidden, { $set: set });
    if (result.matchedCount === 0) return null;
  }
  return {
    model: entry.servedModel,
    promptVersion: entry.promptVersion,
    inputHash: entry.inputHash,
    generatedAt: at.toISOString(),
  };
}

/**
 * Store (or refresh) a shared entry; the reports of an existing entry are kept. Null when the entry is hidden
 * pending review: nothing is written over it.
 */
export function writeShared(
  feature: AiFeature,
  key: string,
  entry: EntryWrite,
): Promise<AiProvenance | null> {
  return write({ feature, scope: "shared", userId: null, key }, entry);
}

export async function writePersonal(
  feature: AiFeature,
  userId: string,
  key: string,
  entry: EntryWrite,
): Promise<AiProvenance> {
  const provenance = await write({ feature, scope: "user", userId: objectId(userId), key }, entry);
  // Personal entries are never reported, so never hidden.
  if (!provenance) throw new Error("A personal AI entry cannot be hidden.");
  return provenance;
}

/** Forget a personal entry (e.g. its stored draft is gone). */
export async function deletePersonal(
  feature: AiFeature,
  userId: string,
  key: string,
): Promise<void> {
  await getDb();
  await AiCache.deleteOne({ feature, scope: "user", userId: objectId(userId), key });
}
