import "server-only";
import { createHash, createHmac } from "node:crypto";
import mongoose from "mongoose";
import { normalizeEmail } from "@/lib/api/account";
import { dayKey } from "@/lib/format";
import { TERM_TIME_ZONE } from "@/lib/term";
import { aiFailure, type AiFailure, type AiFeature } from "@/lib/types/ai";
import AiUsage from "@/models/AiUsage";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import type { TokenUsage } from "@/server/ai/client";
import { DAILY_GENERATION_QUOTA, DAILY_REGENERATION_QUOTA } from "@/server/ai/config";
import { now } from "@/server/clock";
import { addDays } from "@/server/content/define";
import { getDb } from "@/server/db";
import { readEnv } from "@/server/env";
import { consumeRateLimit, isDuplicateKeyError, rateLimitsOff } from "@/server/http";

/**
 * AI usage, the daily token budget and the per-student quotas (PLAN §6.1 W6 "Quotas and budget").
 *
 *   - Usage (aiusages): per (America/New_York day, pseudonymous subject, feature) counters of generations, cache
 *     hits, failures, fallbacks and tokens (usage.iterations summed), plus the serving models.
 *   - Budget: AI_DAILY_TOKEN_BUDGET over the day's tokens of every subject → "AI is paused for today" (kind budget)
 *     before any new generation; answers already in aicache_v2 are still served.
 *   - Quotas (ratelimits, through server/http consumeRateLimit, so RATE_LIMITS=off skips them in e2e):
 *       ai-generations-<YYYYMMDD>:mailbox:<hmac>    20 cache-miss generations a day, all features (a miss on a
 *                                                    shared item counts against the student who asked)
 *       ai-regenerations-<YYYYMMDD>:mailbox:<hmac>  3 regenerations of personal items a day
 *     The key carries the America/New_York day, so a quota resets at midnight in Davidson, not at a UTC boundary.
 *     The subject is the verified mailbox, as a keyed hash (HMAC-SHA256 with NEXTAUTH_SECRET, 32 hex), not the
 *     account id: deleting the account and registering the same mailbox again does not reset the day's quota.
 *     These counters name no account and are not erased with it; they expire with their window (at most ~2 days).
 *     An account without a stored address (never the case for a verified student) falls back to ":user:<id>".
 *     The generation quota is taken first; a regeneration that is over its limit gives the generation back, and
 *     a call that failed before any model answer (an API error) gives both back (refundQuotas).
 */

const USAGE_TTL_MS = 90 * 86_400_000;
const DAY_SEC = 86_400;

/** The usage/quota day of an instant: "YYYY-MM-DD" in America/New_York. */
export function aiDay(at: Date = now()): string {
  return dayKey(at, TERM_TIME_ZONE);
}

/**
 * Rows of erased accounts are folded into this subject (per day and feature) before they are deleted, so erasing
 * an account never lowers the day's token total the budget breaker measures. It names nobody (account ids are
 * 24 hex characters, so no account has this id).
 */
export const ERASED_SUBJECT = "erased";

/** Pseudonymous usage subject of an account id (or "system" for scheduled jobs), as an ObjectId. */
export function usageSubject(userId: string | null): mongoose.Types.ObjectId {
  const hex = createHash("sha256")
    .update(`makeitso:ai-usage:${userId ?? "system"}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

export interface UsageEvent {
  /** null for scheduled jobs. */
  userId: string | null;
  feature: AiFeature;
  /** A model call (with its tokens), or a cache hit. */
  kind: "generation" | "cache-hit";
  usage?: TokenUsage;
  servedModel?: string;
  fallbackUsed?: boolean;
  failed?: boolean;
  regeneration?: boolean;
}

/** Count one event (atomic upsert; never throws for a duplicate-key race). */
export async function recordUsage(event: UsageEvent): Promise<void> {
  await getDb();
  const at = now();
  const usage = event.usage;
  const inc: Record<string, number> = {};
  if (event.kind === "cache-hit") inc.cacheHits = 1;
  else inc.generations = 1;
  if (event.regeneration) inc.regenerations = 1;
  if (event.failed) inc.failures = 1;
  if (event.fallbackUsed) inc.fallbacks = 1;
  if (usage) {
    inc.inputTokens = usage.inputTokens;
    inc.outputTokens = usage.outputTokens;
    inc.cacheReadTokens = usage.cacheReadTokens;
    inc.cacheCreationTokens = usage.cacheCreationTokens;
  }
  const update: Record<string, unknown> = {
    $inc: inc,
    $setOnInsert: { expiresAt: new Date(Math.max(at.getTime(), Date.now()) + USAGE_TTL_MS) },
  };
  if (event.servedModel) update.$addToSet = { models: event.servedModel };
  const filter = { day: aiDay(at), userId: usageSubject(event.userId), feature: event.feature };
  try {
    await AiUsage.updateOne(filter, update, { upsert: true });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    await AiUsage.updateOne(filter, update, { upsert: true });
  }
}

const COUNTERS = [
  "generations",
  "regenerations",
  "cacheHits",
  "failures",
  "fallbacks",
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheCreationTokens",
] as const;

/**
 * Erasure: move a student's usage rows into the non-personal ERASED_SUBJECT row of the same day and feature, then
 * delete them. Returns how many of the student's rows were removed.
 */
export async function eraseUsage(userId: string): Promise<number> {
  await getDb();
  const subject = usageSubject(userId);
  const rows = await AiUsage.find({ userId: subject }).lean();
  const erased = usageSubject(ERASED_SUBJECT);
  for (const row of rows) {
    const inc: Record<string, number> = { generations: 0 };
    for (const counter of COUNTERS) {
      const value = (row as Record<string, unknown>)[counter];
      if (typeof value === "number" && value > 0) inc[counter] = value;
    }
    const update: Record<string, unknown> = { $inc: inc, $max: { expiresAt: row.expiresAt } };
    if (row.models && row.models.length > 0) update.$addToSet = { models: { $each: row.models } };
    const filter = { day: row.day, userId: erased, feature: row.feature };
    try {
      await AiUsage.updateOne(filter, update, { upsert: true });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      await AiUsage.updateOne(filter, update, { upsert: true });
    }
  }
  return (await AiUsage.deleteMany({ userId: subject })).deletedCount;
}

/** Tokens used today by everyone (the budget's measure). */
export async function tokensUsedToday(): Promise<number> {
  await getDb();
  const [row] = await AiUsage.aggregate<{ total: number }>([
    { $match: { day: aiDay() } },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $add: ["$inputTokens", "$outputTokens", "$cacheReadTokens", "$cacheCreationTokens"],
          },
        },
      },
    },
  ]);
  return row?.total ?? 0;
}

/** The budget failure when today's tokens reached AI_DAILY_TOKEN_BUDGET, else null. */
export async function budgetFailure(): Promise<AiFailure | null> {
  const budget = readEnv("AI_DAILY_TOKEN_BUDGET");
  if ((await tokensUsedToday()) >= budget) return aiFailure("budget");
  return null;
}

// ---- Quotas ------------------------------------------------------------------------------------------------------

export type QuotaRule = "ai-generations" | "ai-regenerations";

/** The keyed hash of a mailbox in quota keys (not reversible without the server secret). */
export function mailboxKey(email: string): string {
  return createHmac("sha256", readEnv("NEXTAUTH_SECRET"))
    .update(`makeitso:ai-quota:${normalizeEmail(email)}`, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/** The quota subject of a student: "mailbox:<hmac>" of the stored address, else "user:<id>". */
export async function quotaSubject(userId: string): Promise<string> {
  if (mongoose.isValidObjectId(userId)) {
    await getDb();
    const doc = await User.findById(userId).select("email").lean();
    if (typeof doc?.email === "string" && doc.email) return `mailbox:${mailboxKey(doc.email)}`;
  }
  return `user:${userId}`;
}

/** The ratelimits key of a quota subject ("mailbox:<hmac>" or "user:<id>") for the day. */
export function quotaKey(rule: QuotaRule, subject: string, day: string = aiDay()): string {
  return `${rule}-${day.replace(/-/g, "")}:${subject}`;
}

/** One consumed quota unit (what refundQuotas gives back). */
interface QuotaUnit {
  key: string;
  windowStart: Date;
}

/** What a generation took from the student's quotas. */
export interface QuotaReceipt {
  units: QuotaUnit[];
}

/**
 * Count one use of a daily quota. consumeRateLimit keys windows by fixed UTC-aligned periods; the day is in the
 * key instead, and the window is anchored at noon UTC of the next day so every hit of one America/New_York day
 * lands in the same window, which ends after that day is over. When server "now" is pinned in the past
 * (FIXTURES_NOW), the counter's purge time is pushed past the real clock so the TTL monitor never deletes a live
 * counter during a test.
 */
async function consumeDaily(
  rule: QuotaRule,
  subject: string,
  limit: number,
): Promise<{ allowed: boolean; unit: QuotaUnit | null }> {
  const at = now();
  const day = aiDay(at);
  const key = quotaKey(rule, subject, day);
  const anchor = new Date(Date.parse(`${addDays(day, 1)}T12:00:00Z`));
  const result = await consumeRateLimit(key, limit, DAY_SEC, anchor);
  if (rateLimitsOff()) return { allowed: true, unit: null };
  const windowStart = new Date(Date.parse(`${addDays(day, 1)}T00:00:00Z`));
  const windowEnd = windowStart.getTime() + DAY_SEC * 1000;
  const purgeAt = Math.max(windowEnd, Date.now() + (windowEnd - at.getTime()));
  if (purgeAt > windowEnd) {
    await RateLimit.collection.updateOne(
      { key, windowStart },
      { $max: { expiresAt: new Date(purgeAt) } },
    );
  }
  return { allowed: result.allowed, unit: result.allowed ? { key, windowStart } : null };
}

export const REGENERATION_QUOTA_MESSAGE =
  "You have used today's 3 regenerations. They reset tomorrow; your current answer is still saved.";

/** Give back what a receipt took (a call that produced nothing; a regeneration over its limit). */
export async function refundQuotas(receipt: QuotaReceipt): Promise<void> {
  if (receipt.units.length === 0) return;
  await getDb();
  for (const unit of receipt.units) {
    await RateLimit.collection.updateOne(
      { key: unit.key, windowStart: unit.windowStart, count: { $gt: 0 } },
      { $inc: { count: -1 } },
    );
  }
  receipt.units.length = 0;
}

/**
 * Take one cache-miss generation (and, for an explicit regeneration of a current personal answer, one
 * regeneration) from the student's quotas. The generation quota is checked first, so a student out of
 * generations never loses a regeneration; a regeneration over its limit gives the generation back.
 */
export async function consumeQuotas(
  userId: string,
  { regeneration }: { regeneration: boolean },
): Promise<{ failure: AiFailure } | { receipt: QuotaReceipt }> {
  const subject = await quotaSubject(userId);
  const generation = await consumeDaily("ai-generations", subject, DAILY_GENERATION_QUOTA);
  if (!generation.allowed) return { failure: aiFailure("quota") };
  const receipt: QuotaReceipt = { units: generation.unit ? [generation.unit] : [] };
  if (regeneration) {
    const regen = await consumeDaily("ai-regenerations", subject, DAILY_REGENERATION_QUOTA);
    if (!regen.allowed) {
      await refundQuotas(receipt);
      return { failure: aiFailure("quota", REGENERATION_QUOTA_MESSAGE) };
    }
    if (regen.unit) receipt.units.push(regen.unit);
  }
  return { receipt };
}

/** One cache-miss generation for the student; the quota failure when today's 20 are used. */
export async function consumeGenerationQuota(userId: string): Promise<AiFailure | null> {
  const result = await consumeQuotas(userId, { regeneration: false });
  return "failure" in result ? result.failure : null;
}

/** One regeneration for the student (without a generation); the quota failure when today's 3 are used. */
export async function consumeRegenerationQuota(userId: string): Promise<AiFailure | null> {
  const subject = await quotaSubject(userId);
  return (await consumeDaily("ai-regenerations", subject, DAILY_REGENERATION_QUOTA)).allowed
    ? null
    : aiFailure("quota", REGENERATION_QUOTA_MESSAGE);
}
