import "server-only";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { dayKey } from "@/lib/format";
import { TERM_TIME_ZONE } from "@/lib/term";
import { aiFailure, type AiFailure, type AiFeature } from "@/lib/types/ai";
import AiUsage from "@/models/AiUsage";
import RateLimit from "@/models/RateLimit";
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
 *       ai-generations-<YYYYMMDD>:user:<id>    20 cache-miss generations a day, all features (a miss on a shared
 *                                               item counts against the student who asked)
 *       ai-regenerations-<YYYYMMDD>:user:<id>  3 regenerations of personal items a day
 *     The key carries the America/New_York day, so a quota resets at midnight in Davidson, not at a UTC boundary.
 *     Keys end in ":user:<id>", so W3's ratelimits eraser exports and deletes them with the account.
 */

const USAGE_TTL_MS = 90 * 86_400_000;
const DAY_SEC = 86_400;

/** The usage/quota day of an instant: "YYYY-MM-DD" in America/New_York. */
export function aiDay(at: Date = now()): string {
  return dayKey(at, TERM_TIME_ZONE);
}

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

/** The ratelimits key of a student's quota for the day. */
export function quotaKey(rule: QuotaRule, userId: string, day: string = aiDay()): string {
  return `${rule}-${day.replace(/-/g, "")}:user:${userId}`;
}

/**
 * Count one use of a daily quota. consumeRateLimit keys windows by fixed UTC-aligned periods; the day is in the
 * key instead, and the window is anchored at noon UTC of the next day so every hit of one America/New_York day
 * lands in the same window, which ends after that day is over. When server "now" is pinned in the past
 * (FIXTURES_NOW), the counter's purge time is pushed past the real clock so the TTL monitor never deletes a live
 * counter during a test.
 */
async function consumeDaily(rule: QuotaRule, userId: string, limit: number): Promise<boolean> {
  const at = now();
  const day = aiDay(at);
  const key = quotaKey(rule, userId, day);
  const anchor = new Date(Date.parse(`${addDays(day, 1)}T12:00:00Z`));
  const result = await consumeRateLimit(key, limit, DAY_SEC, anchor);
  if (!rateLimitsOff()) {
    const windowStart = new Date(Date.parse(`${addDays(day, 1)}T00:00:00Z`));
    const windowEnd = windowStart.getTime() + DAY_SEC * 1000;
    const purgeAt = Math.max(windowEnd, Date.now() + (windowEnd - at.getTime()));
    if (purgeAt > windowEnd) {
      await RateLimit.collection.updateOne(
        { key, windowStart },
        { $max: { expiresAt: new Date(purgeAt) } },
      );
    }
  }
  return result.allowed;
}

/** One cache-miss generation for the student; the quota failure when today's 20 are used. */
export async function consumeGenerationQuota(userId: string): Promise<AiFailure | null> {
  return (await consumeDaily("ai-generations", userId, DAILY_GENERATION_QUOTA))
    ? null
    : aiFailure("quota");
}

export const REGENERATION_QUOTA_MESSAGE =
  "You have used today's 3 regenerations. They reset tomorrow; your current answer is still saved.";

/** One regeneration for the student; the quota failure when today's 3 are used. */
export async function consumeRegenerationQuota(userId: string): Promise<AiFailure | null> {
  return (await consumeDaily("ai-regenerations", userId, DAILY_REGENERATION_QUOTA))
    ? null
    : aiFailure("quota", REGENERATION_QUOTA_MESSAGE);
}
