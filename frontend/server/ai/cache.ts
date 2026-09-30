import "server-only";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type { AiFeature, AiProvenance } from "@/lib/types/ai";
import AiCache from "@/models/AiCache";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";

/**
 * aicache_v2 access (models/AiCache.ts). Shared entries (course-about, professor-summary) are keyed only by what
 * the server derived from official data, so no student can change what another student receives; personal entries
 * are keyed by the student's id. Reads ignore expired entries (the TTL monitor deletes them within a minute or so).
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
  if (!doc || !(doc.validUntil instanceof Date) || doc.validUntil.getTime() <= at.getTime()) {
    return null;
  }
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
): Promise<AiProvenance> {
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
  try {
    await AiCache.updateOne(filter, { $set: set }, { upsert: true });
  } catch (error) {
    // Two first writers can race on the upsert; the loser writes as an update.
    if (!isDuplicateKeyError(error)) throw error;
    await AiCache.updateOne(filter, { $set: set });
  }
  return {
    model: entry.servedModel,
    promptVersion: entry.promptVersion,
    inputHash: entry.inputHash,
    generatedAt: at.toISOString(),
  };
}

/** Store (or refresh) a shared entry; reports and the hidden flag of an existing entry are kept. */
export function writeShared(
  feature: AiFeature,
  key: string,
  entry: EntryWrite,
): Promise<AiProvenance> {
  return write({ feature, scope: "shared", userId: null, key }, entry);
}

export function writePersonal(
  feature: AiFeature,
  userId: string,
  key: string,
  entry: EntryWrite,
): Promise<AiProvenance> {
  return write({ feature, scope: "user", userId: objectId(userId), key }, entry);
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
