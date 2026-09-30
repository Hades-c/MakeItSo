import "server-only";
import type { TermCode } from "@/lib/term";
import type { Availability } from "@/lib/types/catalog";
import CatalogSection from "@/models/CatalogSection";
import { computeAvailability, defaultHistoryTerms } from "@/server/catalog/availability";
import { listTermMetas } from "@/server/catalog/meta";
import { ensureTermData, isRefreshDue, scheduleBackfill } from "@/server/catalog/refresh";
import { ingestWindow, resolveTermsImpl } from "@/server/catalog/terms";
import { getDb } from "@/server/db";

/** Sections of a code per term, over every ingested term. */
async function sectionCountsByTerm(code: string): Promise<Map<TermCode, number>> {
  await getDb();
  const rows = await CatalogSection.aggregate<{ _id: string; count: number }>([
    { $match: { courseCode: code } },
    { $group: { _id: "$termCode", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

/**
 * Availability of a (normalised) course code in `terms` (default: the course-history window, see
 * defaultHistoryTerms). The current and registration terms are loaded first, in parallel (cold load if needed);
 * window terms that were never ingested are queued for a background backfill and reported once they are.
 */
export async function courseAvailability(
  code: string,
  terms?: readonly TermCode[],
): Promise<Availability[]> {
  const resolved = await resolveTermsImpl();
  await Promise.all([
    ensureTermData(resolved.current, resolved),
    ensureTermData(resolved.registration, resolved),
  ]);
  const metas = await listTermMetas();
  const missing = ingestWindow(resolved).filter((term) => {
    const meta = metas.get(term) ?? null;
    return !meta?.lastSuccessAt && isRefreshDue(meta, false);
  });
  scheduleBackfill(resolved, missing);
  return computeAvailability({
    terms: terms && terms.length > 0 ? terms : defaultHistoryTerms(resolved, metas),
    resolved,
    metas,
    sectionCounts: await sectionCountsByTerm(code),
  });
}
