import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import User from "@/models/User";
import VerificationCode, { type VerificationPurpose } from "@/models/VerificationCode";
import { purgeTime, releaseCodeGuess, reserveCodeGuess } from "@/server/auth/rate-limits";
import { getDb, trusted } from "@/server/db";
import { readEnv } from "@/server/env";

/**
 * One-time e-mail codes (PLAN §6.1 W3): 6 digits, stored only as a hash, valid 15 minutes, 5 attempts each, one
 * live code per (user, purpose). Sends are limited by the callers (3/h per user; an unverified account's
 * verification and reset codes share one budget, in ratelimits).
 *
 * Wrong codes also count against a budget per account and purpose: 10 a day (server/auth/rate-limits.ts
 * reserveCodeGuess: "code-fail:user:<id>" for the signed-in verification, "reset-fail:user:<id>" for the public
 * password reset, kept apart so anonymous reset guesses cannot lock the owner's verification). Each check reserves a guess before
 * comparing (atomic, so parallel guesses cannot exceed it) and a right code gives it back. Once the day's 10 are
 * used up, codes are not compared at all (reason "locked") and the callers send no new ones. Without this cap an
 * attacker could spend 5 guesses on every new code, about 30 an hour through verification and reset together,
 * indefinitely.
 *
 * The stored hash is HMAC-SHA256(NEXTAUTH_SECRET, "<purpose>:<userId>:<code>"): a plain sha256 of six digits can
 * be reversed from a database dump in milliseconds, the keyed hash cannot without the server secret, and binding
 * the user and purpose means a code never works for another account or flow.
 *
 * Attempts are counted atomically BEFORE comparing (`$inc` in the same findOneAndUpdate that selects a live code
 * with attempts < 5), so parallel guesses cannot exceed the limit.
 */

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
/** Sends per hour per user and purpose (consumeRateLimit key "<purpose-rule>:user:<id>"). */
export const CODE_SENDS_PER_HOUR = 3;
/** How long the code document (hash, address, counters) is kept after the send: PLAN "verification codes 24 h". */
export const CODE_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Uniformly random, zero-padded: "004271". */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(userId: string, purpose: VerificationPurpose, code: string): string {
  return createHmac("sha256", readEnv("NEXTAUTH_SECRET"))
    .update(`${purpose}:${userId}:${code}`, "utf8")
    .digest("hex");
}

function objectId(userId: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(userId)) throw new TypeError(`Invalid user id: ${userId}`);
  return new mongoose.Types.ObjectId(userId);
}

/** Create (or replace) the user's live code for `purpose` and return the plain code to e-mail. */
export async function issueCode(
  userId: string,
  email: string,
  purpose: VerificationPurpose,
  now: Date,
): Promise<string> {
  const code = generateCode();
  await getDb();
  await VerificationCode.findOneAndUpdate(
    { userId: objectId(userId), purpose },
    {
      $set: {
        email,
        codeHash: hashCode(userId, purpose, code),
        attempts: 0,
        lastSentAt: now,
        consumedAt: null,
        codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
        expiresAt: purgeTime(new Date(now.getTime() + CODE_RETENTION_MS), now),
      },
    },
    { upsert: true },
  );
  return code;
}

export type CodeCheck =
  | { ok: true; email: string }
  | {
      ok: false;
      /**
       * missing: never sent, already used or replaced · expired · too_many_attempts (this code's 5) · locked (the
       * account's 10 wrong codes a day; `retryAfterSec` says when) · mismatch
       */
      reason: "missing" | "expired" | "too_many_attempts" | "locked" | "mismatch";
      attemptsLeft: number;
      retryAfterSec?: number;
    };

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/**
 * Check `code` against the user's live code for `purpose`, spending one attempt of the code and one guess of the
 * account's daily budget (given back on a match). On a match the code is consumed (it works once) and the address
 * it was sent to is returned. Without a live code nothing is compared and no guess is spent.
 */
export async function consumeCode(
  userId: string,
  purpose: VerificationPurpose,
  code: string,
  now: Date,
): Promise<CodeCheck> {
  await getDb();
  const id = objectId(userId);
  const doc = await VerificationCode.findOneAndUpdate(
    {
      userId: id,
      purpose,
      consumedAt: null,
      codeExpiresAt: trusted({ $gt: now }),
      attempts: trusted({ $lt: MAX_CODE_ATTEMPTS }),
    },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).lean();

  if (!doc) {
    const existing = await VerificationCode.findOne({ userId: id, purpose }).lean();
    if (!existing || existing.consumedAt) return { ok: false, reason: "missing", attemptsLeft: 0 };
    if (!(existing.codeExpiresAt instanceof Date) || existing.codeExpiresAt <= now) {
      return { ok: false, reason: "expired", attemptsLeft: 0 };
    }
    return { ok: false, reason: "too_many_attempts", attemptsLeft: 0 };
  }

  const guess = await reserveCodeGuess(userId, now, purpose);
  if (!guess.allowed) {
    console.warn(
      `[auth] ${purpose} codes locked for user ${userId}: the day's wrong-code budget is used up`,
    );
    return { ok: false, reason: "locked", attemptsLeft: 0, retryAfterSec: guess.retryAfterSec };
  }
  const attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - (doc.attempts ?? MAX_CODE_ATTEMPTS));
  if (!/^\d{6}$/.test(code) || !sameHash(doc.codeHash, hashCode(userId, purpose, code))) {
    return { ok: false, reason: "mismatch", attemptsLeft };
  }
  await releaseCodeGuess(userId, now, purpose);
  // Consume exactly once, even if two correct submissions race.
  const consumed = await VerificationCode.updateOne(
    { _id: doc._id, consumedAt: null },
    { $set: { consumedAt: now } },
  );
  if (consumed.modifiedCount !== 1) return { ok: false, reason: "missing", attemptsLeft: 0 };
  return { ok: true, email: doc.email };
}

/** The user's live (unused, unexpired, attempts left) code for `purpose`: when it was sent, or null. */
export async function liveCode(
  userId: string,
  purpose: VerificationPurpose,
  now: Date,
): Promise<{ sentAt: Date; expiresAt: Date } | null> {
  if (!mongoose.isValidObjectId(userId)) return null;
  await getDb();
  const doc = await VerificationCode.findOne({
    userId: objectId(userId),
    purpose,
    consumedAt: null,
    codeExpiresAt: trusted({ $gt: now }),
    attempts: trusted({ $lt: MAX_CODE_ATTEMPTS }),
  })
    .select("lastSentAt codeExpiresAt")
    .lean();
  return doc ? { sentAt: doc.lastSentAt, expiresAt: doc.codeExpiresAt } : null;
}

/**
 * A code (verification or reset) reached a still-unverified new sign-up's inbox: start its 24 h replacement
 * window (User.verificationSentAt, the first send only). Accounts never sent a code are never replaced
 * (server/auth/registration.ts).
 */
export async function markCodeSent(userId: string, now: Date): Promise<void> {
  if (!mongoose.isValidObjectId(userId)) return;
  await getDb();
  await User.updateOne(
    { _id: objectId(userId), emailVerifiedAt: trusted({ $type: "null" }) },
    { $min: { verificationSentAt: now } },
  );
}

/** Drop the user's codes for `purpose` (after a successful verification elsewhere, or a replaced account). */
export async function deleteCodes(userId: string, purpose?: VerificationPurpose): Promise<number> {
  if (!mongoose.isValidObjectId(userId)) return 0;
  await getDb();
  const filter = purpose ? { userId: objectId(userId), purpose } : { userId: objectId(userId) };
  return (await VerificationCode.deleteMany(filter)).deletedCount;
}
