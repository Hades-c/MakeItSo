import "server-only";
import type { TermCode } from "@/lib/term";
import type { Availability } from "@/lib/types/catalog";
import CatalogSection from "@/models/CatalogSection";
import {
  availabilityComplete,
  computeAvailability,
  defaultHistoryTerms,
} from "@/server/catalog/availability";
import { listTermMetas } from "@/server/catalog/meta";
import { ensureTermData, isRefreshDue, scheduleBackfill } from "@/server/catalog/refresh";
import { ingestWindow, resolveTermsImpl } from "@/server/catalog/terms";
import { getDb, trusted } from "@/server/db";

/** Sections per term of each code, over every ingested term: one aggregate for all the codes. */
async function sectionCountsByCodeAndTerm(
  codes: readonly string[],
): Promise<Map<string, Map<TermCode, number>>> {
  const out = new Map<string, Map<TermCode, number>>(codes.map((code) => [code, new Map()]));
  if (codes.length === 0) return out;
  await getDb();
  const rows = await CatalogSection.aggregate<{
    _id: { code: string; term: string };
    count: number;
  }>([
    { $match: { courseCode: trusted({ $in: [...new Set(codes)] }) } },
    { $group: { _id: { code: "$courseCode", term: "$termCode" }, count: { $sum: 1 } } },
  ]);
  for (const row of rows) out.get(row._id.code)?.set(row._id.term, row.count);
  return out;
}

/** Sections of a code per term, over every ingested term. */
async function sectionCountsByTerm(code: string): Promise<Map<TermCode, number>> {
  return (await sectionCountsByCodeAndTerm([code])).get(code) ?? new Map();
}

export interface AvailabilityReport {
  availability: Availability[];
  /**
   * False while a term the answer depends on waits for the history backfill: the answer will change (more terms,
   * a "usually offered"), so it must not be cached publicly.
   */
  complete: boolean;
}

/**
 * Availability of a (normalised) course code in `terms` (default: the course-history window, see
 * defaultHistoryTerms). The current and registration terms are loaded first, in parallel (cold load if needed);
 * window terms that were never ingested are queued for a background backfill and reported once they are.
 */
export async function courseAvailabilityReport(
  code: string,
  terms?: readonly TermCode[],
): Promise<AvailabilityReport> {
  const resolved = await resolveTermsImpl();
  await Promise.all([
    ensureTermData(resolved.current, resolved),
    ensureTermData(resolved.registration, resolved),
  ]);
  const metas = await listTermMetas();
  const window = ingestWindow(resolved);
  const missing = window.filter((term) => {
    const meta = metas.get(term) ?? null;
    return !meta?.lastSuccessAt && isRefreshDue(meta, false);
  });
  scheduleBackfill(resolved, missing);
  const explicit = terms && terms.length > 0 ? terms : null;
  const reported = explicit ?? defaultHistoryTerms(resolved, metas);
  return {
    availability: computeAvailability({
      terms: reported,
      resolved,
      metas,
      sectionCounts: await sectionCountsByTerm(code),
    }),
    complete: availabilityComplete({
      // The default report also lists summers once they turn out to have sections: all of the window counts.
      terms: explicit ?? [...new Set([...window, ...reported])],
      resolved,
      metas,
      window,
    }),
  };
}

/** Availability only (getCourseHistory). */
export async function courseAvailability(
  code: string,
  terms?: readonly TermCode[],
): Promise<Availability[]> {
  return (await courseAvailabilityReport(code, terms)).availability;
}

/**
 * Availability of many (normalised) codes in the same `terms`, with one term resolution and one aggregate for all
 * of them (the /courses results: one read per page instead of one per row). Same answers as courseAvailability.
 */
export async function coursesAvailability(
  codes: readonly string[],
  terms: readonly TermCode[],
): Promise<Map<string, Availability[]>> {
  const resolved = await resolveTermsImpl();
  await Promise.all([
    ensureTermData(resolved.current, resolved),
    ensureTermData(resolved.registration, resolved),
  ]);
  const [metas, counts] = await Promise.all([listTermMetas(), sectionCountsByCodeAndTerm(codes)]);
  scheduleBackfill(
    resolved,
    ingestWindow(resolved).filter((term) => {
      const meta = metas.get(term) ?? null;
      return !meta?.lastSuccessAt && isRefreshDue(meta, false);
    }),
  );
  return new Map(
    codes.map((code) => [
      code,
      computeAvailability({
        terms,
        resolved,
        metas,
        sectionCounts: counts.get(code) ?? new Map(),
      }),
    ]),
  );
}
