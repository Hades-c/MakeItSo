import "server-only";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { nextRegularTerm, termLabel, type TermCode } from "@/lib/term";
import type { Availability } from "@/lib/types/catalog";
import {
  countCourses,
  getCourseHistory,
  resolveTerms,
  validateCourseCodes,
} from "@/server/catalog";
import { careerCourseCodes } from "@/server/content/careers";
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

/** The current, registration and next terms (null when the catalog cannot say). */
export const loadCareerTerms = cache(async (): Promise<CareerTerms | null> => {
  try {
    const resolved = await resolveTerms();
    return {
      current: resolved.current,
      registration: resolved.registration,
      next: nextRegularTerm(resolved.registration),
    };
  } catch (error) {
    rethrowFatal(error);
    console.error("[careers] could not resolve terms:", error);
    return null;
  }
});

export interface RegistrationOfferings {
  term: TermCode;
  /** "Spring 2027". */
  label: string;
  /** Career course codes with a section of their own in the registration term. */
  offered: ReadonlySet<string>;
}

/**
 * Which career courses are on the registration term's schedule (the /careers cards' "5 of 8 courses on the
 * Spring 2027 schedule"), from one validateCourseCodes() call for all 24 careers. Null when the catalog cannot
 * answer or the registration term is not published yet (no sections at all): an empty schedule must never read
 * as "none of its courses are offered". Memoised per request.
 */
export const loadRegistrationOfferings = cache(async (): Promise<RegistrationOfferings | null> => {
  const terms = await loadCareerTerms();
  if (!terms) return null;
  try {
    const { valid } = await validateCourseCodes(careerCourseCodes(), [terms.registration]);
    if ((await countCourses(terms.registration)) === 0) return null;
    return {
      term: terms.registration,
      label: termLabel(terms.registration),
      offered: new Set(valid),
    };
  } catch (error) {
    rethrowFatal(error);
    console.error("[careers] could not check the registration schedule:", error);
    return null;
  }
});

/** How many of `codes` are on the registration schedule. */
export function offeredCount(offerings: RegistrationOfferings, codes: readonly string[]): number {
  return new Set(codes.filter((code) => offerings.offered.has(code))).size;
}

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
