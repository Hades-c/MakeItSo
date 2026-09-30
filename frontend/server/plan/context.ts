import "server-only";
import mongoose from "mongoose";
import { CLASS_STANDINGS, isTermCode, type ClassStanding } from "@/lib/term";
import User from "@/models/User";
import { defaultGraduationYear } from "@/server/auth/profile";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { defaultFirstTermFor, type PlanContext } from "@/server/plan/terms";

/**
 * The profile fields the plan needs (graduation year, first term, standing override), read from `users` with the
 * same defaults W3's profile uses: graduation year → this year's first-year class; first term → Fall of
 * graduationYear − 4 (PLAN §3 onboarding).
 */

export function userObjectId(userId: string): mongoose.Types.ObjectId {
  if (!/^[a-f0-9]{24}$/.test(userId) || !mongoose.isValidObjectId(userId)) {
    throw new ApiError(404, "not_found", "Account not found.");
  }
  return new mongoose.Types.ObjectId(userId);
}

function isStanding(value: unknown): value is ClassStanding {
  return typeof value === "string" && (CLASS_STANDINGS as readonly string[]).includes(value);
}

export async function loadPlanContext(userId: string, at: Date): Promise<PlanContext> {
  const _id = userObjectId(userId);
  await getDb();
  const doc = await User.collection.findOne(
    { _id },
    { projection: { graduationYear: 1, firstTerm: 1, standingOverride: 1 } },
  );
  const graduationYear =
    typeof doc?.graduationYear === "number" && Number.isInteger(doc.graduationYear)
      ? doc.graduationYear
      : defaultGraduationYear(at);
  const firstTerm =
    typeof doc?.firstTerm === "string" && isTermCode(doc.firstTerm)
      ? doc.firstTerm
      : defaultFirstTermFor(graduationYear);
  return {
    graduationYear,
    firstTerm,
    standingOverride: isStanding(doc?.standingOverride) ? doc.standingOverride : null,
  };
}
