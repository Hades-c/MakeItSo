import "server-only";
import type { SourceId } from "@/lib/sources";
import { termLabel } from "@/lib/term";
import { countCourses, resolveTerms } from "@/server/catalog";
import { CAREERS } from "@/server/content/careers";
import { featureEnabled, loadFlags } from "@/server/features";

/**
 * Runtime facts for the landing page (PLAN §3 "/": truthful claims, computed stats at runtime, never at build; §7
 * "no hardcoded counts"). Each fact is computed from a live service when the page is requested and is left out
 * silently (for the visitor; a real error is logged) when it cannot be computed within the time budget, is zero,
 * or belongs to a section that is switched off.
 *
 *   courses  distinct courses on the registration term's schedule (server/catalog countCourses)
 *   careers  career paths MakeItSo covers (server/content), only while the Careers section is on
 */

export type LandingFactId = "courses" | "careers";

export interface LandingFact {
  id: LandingFactId;
  value: number;
  /** Words after the number: "courses on the Spring 2027 schedule". */
  label: string;
  /** The source tag the number rests on, when it is aggregated data. */
  source: SourceId | null;
}

/** How long the landing waits for a fact (a cold catalog read may fetch the term once). */
export const LANDING_FACT_TIMEOUT_MS = 2_500;

class FactTimeout extends Error {}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FactTimeout()), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function coursesFact(): Promise<LandingFact | null> {
  const { registration } = await resolveTerms();
  const count = await countCourses(registration);
  if (!Number.isInteger(count) || count <= 0) return null;
  return {
    id: "courses",
    value: count,
    label: `courses on the ${termLabel(registration)} schedule`,
    source: "course-schedule",
  };
}

export async function careersFact(): Promise<LandingFact | null> {
  if (!featureEnabled(loadFlags(), "careers") || CAREERS.length === 0) return null;
  return {
    id: "careers",
    value: CAREERS.length,
    label: "career paths, each with real Davidson courses",
    source: null,
  };
}

async function settle(
  id: LandingFactId,
  compute: () => Promise<LandingFact | null>,
  timeoutMs: number,
): Promise<LandingFact | null> {
  try {
    return await withTimeout(compute(), timeoutMs);
  } catch (error) {
    if (!(error instanceof FactTimeout)) console.error(`[landing] the ${id} fact failed:`, error);
    return null;
  }
}

/** Every fact that can be computed right now, in display order. Never throws. */
export async function loadLandingFacts({
  timeoutMs = LANDING_FACT_TIMEOUT_MS,
}: { timeoutMs?: number } = {}): Promise<LandingFact[]> {
  const facts = await Promise.all([
    settle("courses", coursesFact, timeoutMs),
    settle("careers", careersFact, timeoutMs),
  ]);
  return facts.filter((fact): fact is LandingFact => fact !== null);
}
