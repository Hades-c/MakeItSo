import "server-only";
import { isTermCode, type TermCode } from "@/lib/term";
import type { Course, ResolvedTerms } from "@/lib/types/catalog";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/types/common";
import type { TermMeta } from "@/server/catalog/meta";
import { ensureTermData } from "@/server/catalog/refresh";
import { getTermIndex, type TermIndex } from "@/server/catalog/store";
import { resolveTermsImpl } from "@/server/catalog/terms";
import { ApiError } from "@/server/http/errors";

/** Shared read helpers for server/catalog/index.ts and the catalog routes. */

export function assertTerm(term: string): TermCode {
  if (!isTermCode(term)) {
    throw new ApiError(400, "validation_failed", "That is not a term code such as 202602.");
  }
  return term;
}

/** "Schedule data as of": the last accepted refresh of the term; null when never ingested. */
export function termAsOf(meta: TermMeta | null): string | null {
  return meta?.lastSuccessAt ? meta.lastSuccessAt.toISOString() : null;
}

export interface LoadedTerm {
  meta: TermMeta;
  index: TermIndex;
}

/** Load (cold load if needed) and index a term; null when the term has no data (outside the ingest window). */
export async function loadTerm(
  term: TermCode,
  resolved?: ResolvedTerms,
): Promise<LoadedTerm | null> {
  const terms = resolved ?? (await resolveTermsImpl());
  const meta = await ensureTermData(term, terms);
  if (!meta) return null;
  return { meta, index: await getTermIndex(term) };
}

/**
 * The term browsing defaults to: the registration term once its schedule is published (≥ 1 section), else the
 * current term. registrationTermFrom moves to the next semester when classes start (mid-January, late August),
 * weeks before that semester's schedule comes out; meanwhile the registration term is empty and search, the ⌘K
 * palette and the sidebar count would show nothing. Null when neither term has data.
 */
export async function browseTerm(resolved: ResolvedTerms): Promise<TermCode | null> {
  const registration = await ensureTermData(resolved.registration, resolved);
  if ((registration?.sectionCount ?? 0) > 0) return resolved.registration;
  if (resolved.current === resolved.registration) return registration ? resolved.current : null;
  const current = await ensureTermData(resolved.current, resolved);
  if ((current?.sectionCount ?? 0) > 0) return resolved.current;
  return registration ? resolved.registration : null;
}

/** A course with the term's "as of" time; null when not offered. */
export async function readCourse(
  term: TermCode,
  code: string,
): Promise<{ course: Course; asOf: string | null } | null> {
  assertTerm(term);
  const normalized = normalizeCourseCode(code);
  if (!COURSE_CODE_PATTERN.test(normalized)) return null;
  const loaded = await loadTerm(term);
  const course = loaded?.index.byCode.get(normalized)?.course;
  return loaded && course ? { course, asOf: termAsOf(loaded.meta) } : null;
}
