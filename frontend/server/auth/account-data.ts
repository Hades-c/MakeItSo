import "server-only";
import mongoose from "mongoose";
import RateLimit from "@/models/RateLimit";
import User from "@/models/User";
import VerificationCode from "@/models/VerificationCode";
import { registerAccountData } from "@/server/account/erasers";
import { deleteCodes } from "@/server/auth/codes";
import { emailKey } from "@/server/auth/rate-limits";
import { getDb } from "@/server/db";

/**
 * W3's per-user collections in the account data registry (PLAN §4.1.12, §9 "Account data"): the export and the
 * delete cascade (GET /api/me/export, DELETE /api/me) include them. Registered when server/auth (the entry module,
 * listed in ACCOUNT_DATA_MODULES) is evaluated. The users document itself is exported as `profile` and deleted
 * last by server/auth/account.ts, after every eraser succeeded.
 *
 *   verificationcodes  the account's one-time codes (the code hashes are not exported)
 *   ratelimits         counters that name the user ("<rule>:user:<id>": code sends, the wrong-code budget,
 *                      export...) and the address-keyed ones ("<rule>:email:<hash of the address>", optionally
 *                      ":ip:<hash of an IP>": sign-in backoff streaks, "signed in from this IP before", e-mail
 *                      allowances)
 * IP-keyed counters ("login:ip:…") are not personal to one account; they expire with their window.
 */

function isObjectId(userId: string): boolean {
  return /^[a-f0-9]{24}$/.test(userId) && mongoose.isValidObjectId(userId);
}

async function rateLimitFilter(userId: string) {
  // userId is 24 lowercase hex (checked by the caller), so it is safe inside a pattern.
  const patterns = [new RegExp(`^[a-z0-9-]+:user:${userId}$`)];
  const user = await User.findById(userId).select("email").lean();
  if (user?.email) {
    patterns.push(new RegExp(`^[a-z0-9-]+:email:${emailKey(user.email)}(?::ip:[a-f0-9]{16})?$`));
  }
  return { $or: patterns.map((pattern) => ({ key: pattern })) };
}

registerAccountData("verificationcodes", {
  async export(userId) {
    if (!isObjectId(userId)) return [];
    await getDb();
    return VerificationCode.find({ userId: new mongoose.Types.ObjectId(userId) })
      .select("purpose email attempts lastSentAt consumedAt codeExpiresAt expiresAt createdAt -_id")
      .lean();
  },
  async erase(userId) {
    if (!isObjectId(userId)) return 0;
    return deleteCodes(userId);
  },
});

registerAccountData("ratelimits", {
  async export(userId) {
    if (!isObjectId(userId)) return [];
    await getDb();
    return RateLimit.collection
      .find(await rateLimitFilter(userId), {
        projection: {
          _id: 0,
          key: 1,
          windowStart: 1,
          count: 1,
          lastFailureAt: 1,
          lastSignInAt: 1,
          expiresAt: 1,
        },
      })
      .toArray();
  },
  async erase(userId) {
    if (!isObjectId(userId)) return 0;
    await getDb();
    return (await RateLimit.collection.deleteMany(await rateLimitFilter(userId))).deletedCount;
  },
});
