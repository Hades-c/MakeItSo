import "server-only";
import {
  compareTerms,
  isSummer,
  isTermCode,
  nextRegularTerm,
  termSeason,
  termsBetween,
  type TermCode,
} from "@/lib/term";
import type { Availability, ResolvedTerms } from "@/lib/types/catalog";
import { HISTORY_START } from "@/server/catalog/config";
import type { TermMeta } from "@/server/catalog/meta";

/**
 * Availability of one course across terms (PLAN §5 "Availability"). Pure: the caller passes the resolved terms,
 * the term metas and the course's section counts per term.
 *
 * - a published term (≥ 1 section ingested) → "offered" with sectionCount, or "not-offered";
 * - a term after the current one with nothing published → "not-yet-published", plus `usually` when the course ran
 *   in ≥ 2 of the last 3 published same-season terms before it (basedOn = the terms it ran in). Never a bare
 *   "offered" for an unpublished term;
 * - the current term or an earlier one that was ingested but holds no sections (a summer) → "not-offered";
 *   one that was never ingested is left out (nothing is known about it yet; the backfill will fill it in).
 */

/** Default report: every regular term from 202201 through the term after registration, plus summers with data. */
export function defaultHistoryTerms(
  resolved: Pick<ResolvedTerms, "registration">,
  metas: ReadonlyMap<TermCode, TermMeta>,
): TermCode[] {
  const last = nextRegularTerm(resolved.registration);
  return termsBetween(HISTORY_START, last, { includeSummer: true }).filter(
    (term) => !isSummer(term) || (metas.get(term)?.sectionCount ?? 0) > 0,
  );
}

function isPublished(meta: TermMeta | undefined): boolean {
  return (meta?.sectionCount ?? 0) > 0;
}

/** The (up to) three most recent published terms of the same season before `term`. */
export function lastSameSeasonTerms(
  term: TermCode,
  metas: ReadonlyMap<TermCode, TermMeta>,
  count = 3,
): TermCode[] {
  const season = termSeason(term);
  return [...metas.values()]
    .filter(
      (meta) =>
        isTermCode(meta.term) &&
        isPublished(meta) &&
        compareTerms(meta.term, term) < 0 &&
        termSeason(meta.term) === season,
    )
    .map((meta) => meta.term)
    .sort(compareTerms)
    .slice(-count);
}

export interface AvailabilityInput {
  terms: readonly TermCode[];
  resolved: Pick<ResolvedTerms, "current" | "registration">;
  metas: ReadonlyMap<TermCode, TermMeta>;
  /** Sections of the course per term (terms without any are absent or 0). */
  sectionCounts: ReadonlyMap<TermCode, number>;
}

export function computeAvailability({
  terms,
  resolved,
  metas,
  sectionCounts,
}: AvailabilityInput): Availability[] {
  const out: Availability[] = [];
  for (const term of [...new Set(terms)].filter(isTermCode).sort(compareTerms)) {
    const meta = metas.get(term);
    const sections = sectionCounts.get(term) ?? 0;
    if (isPublished(meta)) {
      out.push(
        sections > 0
          ? { termCode: term, status: "offered", sectionCount: sections }
          : { termCode: term, status: "not-offered" },
      );
      continue;
    }
    if (compareTerms(term, resolved.current) <= 0) {
      if (meta?.lastSuccessAt) out.push({ termCode: term, status: "not-offered" });
      continue;
    }
    const recent = lastSameSeasonTerms(term, metas);
    const ran = recent.filter((past) => (sectionCounts.get(past) ?? 0) > 0);
    out.push({
      termCode: term,
      status: "not-yet-published",
      ...(ran.length >= 2 ? { usually: { season: termSeason(term), basedOn: ran } } : {}),
    });
  }
  return out;
}
