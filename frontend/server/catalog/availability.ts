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
 *   in ≥ 2 of the 3 same-season terms right before it (202701 → 202401, 202501, 202601; basedOn = the terms it ran
 *   in). No claim at all while one of those three was never ingested (never reaching further back). Never a bare
 *   "offered" for an unpublished term;
 * - the current term or an earlier one that was ingested but holds no sections (a summer) → "not-offered";
 *   one that was never ingested is left out (nothing is known about it yet; the backfill will fill it in).
 * `availabilityComplete` says whether the answer can change once the backfill runs (the route then skips the
 * CDN cache).
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

/** The `count` terms of the same season right before `term`, oldest first (202701 → 202401, 202501, 202601). */
export function previousSameSeasonTerms(term: TermCode, count = 3): TermCode[] {
  const year = Number(term.slice(0, 4));
  const suffix = term.slice(4);
  const out: TermCode[] = [];
  for (let back = count; back >= 1; back--) {
    const code = `${year - back}${suffix}`;
    if (isTermCode(code)) out.push(code);
  }
  return out;
}

/**
 * "Usually offered in <season>": the course ran in ≥ 2 of the 3 same-season terms right before `term`; null
 * without a claim, including when one of those three was never ingested (unknown, not "not offered").
 */
export function usuallyOffered(
  term: TermCode,
  metas: ReadonlyMap<TermCode, TermMeta>,
  sectionCounts: ReadonlyMap<TermCode, number>,
): Availability["usually"] | null {
  const previous = previousSameSeasonTerms(term);
  if (previous.length < 3 || previous.some((past) => !metas.get(past)?.lastSuccessAt)) return null;
  const ran = previous.filter((past) => (sectionCounts.get(past) ?? 0) > 0);
  return ran.length >= 2 ? { season: termSeason(term), basedOn: ran } : null;
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
    const usually = usuallyOffered(term, metas, sectionCounts);
    out.push({ termCode: term, status: "not-yet-published", ...(usually ? { usually } : {}) });
  }
  return out;
}

/**
 * Whether an availability answer for `terms` is final, i.e. no term it depends on waits for the backfill: every
 * reported term of the ingest window, and the three same-season terms behind each unpublished future term
 * ("usually offered"), have been ingested. Terms outside `window` are never ingested and count as known.
 */
export function availabilityComplete({
  terms,
  resolved,
  metas,
  window,
}: Omit<AvailabilityInput, "sectionCounts"> & { window: readonly TermCode[] }): boolean {
  const inWindow = new Set(window);
  const known = (term: TermCode) => !inWindow.has(term) || !!metas.get(term)?.lastSuccessAt;
  return terms.filter(isTermCode).every((term) => {
    if (!known(term)) return false;
    if (isPublished(metas.get(term)) || compareTerms(term, resolved.current) <= 0) return true;
    return previousSameSeasonTerms(term).every(known);
  });
}
