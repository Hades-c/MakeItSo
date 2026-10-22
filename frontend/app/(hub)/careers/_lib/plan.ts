import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ACTIVE_PLAN_STATUSES, type PlanItem } from "@/lib/types/plan";
import { normalizeCourseCode } from "@/lib/types/common";
import { MissingFixtureError } from "@/server/http/fixtures";
import { ApiError } from "@/server/http/errors";
import { getPlan } from "@/server/plan";

/**
 * Which terms each course is already in the student's plan for (so Add to plan starts as "In your plan for …").
 * Read straight from the plan service (W5s). While that service is not implemented (501) or cannot be read, the
 * answer is "unknown": null, and the page simply starts every course as not added.
 */
export type PlanPresence = ReadonlyMap<string, ReadonlySet<string>>;

/** Terms per course code among active items (planned, registered, in progress, completed). Pure. */
export function planPresence(items: readonly PlanItem[]): PlanPresence {
  const active = new Set<string>(ACTIVE_PLAN_STATUSES);
  const out = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.termCode || !active.has(item.status)) continue;
    for (const code of new Set([item.courseCode, item.canonicalCode].map(normalizeCourseCode))) {
      const terms = out.get(code) ?? new Set<string>();
      terms.add(item.termCode);
      out.set(code, terms);
    }
  }
  return out;
}

export async function loadPlanPresence(userId: string): Promise<PlanPresence | null> {
  try {
    return planPresence((await getPlan(userId)).items);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    // 501: the plan service is not there yet. Anything else is worth a log line; the page works either way.
    if (!(error instanceof ApiError && error.status === 501)) {
      console.error("[careers] could not read the plan:", error);
    }
    return null;
  }
}
