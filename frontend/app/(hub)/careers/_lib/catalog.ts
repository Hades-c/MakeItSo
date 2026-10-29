import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { nextRegularTerm } from "@/lib/term";
import type { Availability, TermInfo } from "@/lib/types/catalog";
import { getCourseHistory, resolveTerms } from "@/server/catalog";
import { MissingFixtureError } from "@/server/http/fixtures";
import type { CareerTerms } from "./availability";

/**
 * Live catalog reads for the careers pages (server/catalog, W1). Course availability is never stored in the career
 * content: it is resolved here, per request, so a course that stops running shows "Not offered" instead of a stale
 * claim. Every failure degrades to "show nothing" (PLAN §5 "Sources (truthfulness)": no guesses), except a
 * MissingFixtureError (a test bug, re-thrown so it is never hidden) and Next.js control flow (re-thrown).
 */

function rethrowFatal(error: unknown): void {
  unstable_rethrow(error);
  if (error instanceof MissingFixtureError) throw error;
}

/** A career page's terms, plus every known term with its dates: what the plan's statuses are judged by. */
export interface LoadedCareerTerms extends CareerTerms {
  schedule: readonly TermInfo[];
}

/** The current, registration and next terms, and the terms list (null when the catalog cannot say). */
export const loadCareerTerms = cache(async (): Promise<LoadedCareerTerms | null> => {
  try {
    const resolved = await resolveTerms();
    return {
      current: resolved.current,
      registration: resolved.registration,
      next: nextRegularTerm(resolved.registration),
      schedule: resolved.terms,
    };
  } catch (error) {
    rethrowFatal(error);
    console.error("[careers] could not resolve terms:", error);
    return null;
  }
});

/**
 * The catalog history of each code (getCourseHistory), in parallel; a code whose history cannot be read maps to
 * null (the page then shows the course without availability rather than a guess).
 */
export async function loadCourseHistories(
  codes: readonly string[],
): Promise<Map<string, Availability[] | null>> {
  const unique = [...new Set(codes)];
  const settled = await Promise.allSettled(unique.map((code) => getCourseHistory(code)));
  const out = new Map<string, Availability[] | null>();
  settled.forEach((result, index) => {
    const code = unique[index]!;
    if (result.status === "fulfilled") {
      out.set(code, result.value);
      return;
    }
    rethrowFatal(result.reason);
    console.error(`[careers] could not read the history of ${code}:`, result.reason);
    out.set(code, null);
  });
  return out;
}
