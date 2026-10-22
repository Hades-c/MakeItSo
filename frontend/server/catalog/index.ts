import "server-only";
import { isTermCode, type TermCode } from "@/lib/term";
import {
  CatalogQuerySchema,
  type Availability,
  type CatalogFilters,
  type CatalogQueryInput,
  type CatalogSearchResult,
  type CodeValidation,
  type Course,
  type ResolvedTerms,
  type Section,
} from "@/lib/types/catalog";
import { COURSE_CODE_PATTERN, CrnSchema, normalizeCourseCode } from "@/lib/types/common";
import CatalogSection from "@/models/CatalogSection";
import { getCatalogFiltersImpl } from "@/server/catalog/filters";
import { courseAvailability } from "@/server/catalog/history";
import {
  assertTerm,
  browseTerm as browseTermOf,
  loadTerm,
  readCourse,
  termAsOf,
} from "@/server/catalog/read";
import { ensureTermData } from "@/server/catalog/refresh";
import { searchIndex } from "@/server/catalog/search";
import { inIngestWindow, resolveTermsImpl } from "@/server/catalog/terms";
import { getDb, trusted } from "@/server/db";
import { ApiError, zodIssues } from "@/server/http/errors";

/**
 * Course catalog service (PLAN §4.1.3; owner W1). FROZEN signatures; callers code against them.
 *
 * Data: the Davidson public course API through fetchExternal("course-schedule", ...), ingested into
 * catalogsections + catalogmeta (PLAN §5 "Catalog ingest": 202201 → registration term; never replace a non-empty
 * term with an empty or < 50%-size result). Codes are "HIS 357"; the URL form is lib/routes.ts courseSlug().
 *
 * Reads are served from an in-process per-term index (server/catalog/store.ts). A term that was never ingested
 * is fetched synchronously once (8 s upstream timeout) and answers ApiError 503 "Schedule data is temporarily
 * unavailable" when that fails; the current and registration terms are refreshed in the background every 15
 * minutes; past terms by the nightly cron (app/api/cron/catalog, server/catalog/cron.ts). Terms outside
 * 202201…registration that were never ingested have no data: searches are empty, getCourse is null.
 */

export interface ResolveTermsOptions {
  /** Evaluate "current" and "registration" at this instant (default: `now()` from server/clock.ts, which is pinned
   * by FIXTURES_NOW in fixtures mode; never `new Date()` directly). */
  now?: Date;
}

/** Every known term with the current and registration terms resolved (lib/term.ts rules). Never throws for an
 * upstream outage once a terms list has been cached; falls back to termFromDateET when none ever was. */
export async function resolveTerms(options: ResolveTermsOptions = {}): Promise<ResolvedTerms> {
  return resolveTermsImpl(options);
}

/**
 * The term browsing defaults to (the /courses term selector, searchCourses without a term, the ⌘K palette, the
 * sidebar course count): the registration term once its schedule is published (≥ 1 section), else the current
 * term. registrationTermFrom moves to the next semester when classes start (mid-January, late August), weeks before
 * upstream publishes that schedule; meanwhile the registration term would show nothing. Falls back to the
 * registration term when neither has data. May cold-load those two terms (like searchCourses).
 */
export async function browseTerm(options: ResolveTermsOptions = {}): Promise<TermCode> {
  const resolved = await resolveTermsImpl(options);
  return (await browseTermOf(resolved)) ?? resolved.registration;
}

/** Search one term (default: browseTerm()). See CatalogQuerySchema for filter semantics. */
export async function searchCourses(query: CatalogQueryInput): Promise<CatalogSearchResult> {
  const parsed = CatalogQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "validation_failed",
      "Some search fields are invalid.",
      zodIssues(parsed.error),
    );
  }
  const q = parsed.data;
  const resolved = await resolveTermsImpl();
  const term = q.term ?? (await browseTermOf(resolved)) ?? resolved.registration;
  const loaded = await loadTerm(term, resolved);
  if (!loaded) {
    return { term, items: [], total: 0, page: q.page, pageSize: q.pageSize, asOf: null };
  }
  const { items, total } = searchIndex(loaded.index, q);
  return { term, items, total, page: q.page, pageSize: q.pageSize, asOf: termAsOf(loaded.meta) };
}

/** All sections of `code` in `term`; null when the course is not offered (or the term is unpublished). */
export async function getCourse(term: TermCode, code: string): Promise<Course | null> {
  return (await readCourse(term, code))?.course ?? null;
}

/** One section by CRN; null when it does not exist in that term. */
export async function getSection(term: TermCode, crn: string): Promise<Section | null> {
  assertTerm(term);
  const parsed = CrnSchema.safeParse(crn);
  if (!parsed.success) return null;
  const loaded = await loadTerm(term);
  return loaded?.index.byCrn.get(parsed.data) ?? null;
}

/**
 * Availability of `code` in every ingested term plus the unpublished terms through the one after registration
 * (PLAN §5 "Availability": offered / not-offered / not-yet-published + "usually offered").
 */
export async function getCourseHistory(code: string): Promise<Availability[]> {
  const normalized = normalizeCourseCode(code);
  if (!COURSE_CODE_PATTERN.test(normalized)) {
    throw new ApiError(400, "validation_failed", "That is not a course code such as CSC 221.");
  }
  return courseAvailability(normalized);
}

/**
 * Split codes into those offered in at least one of `terms` (default: every ingested term) and the rest. Codes are
 * canonicalised ("csc121" → "CSC 121"). A code is valid when a listing of its own exists, so every valid code has a
 * course page (getCourse) and a history (getCourseHistory) in that term; cross-listed siblings have listings of
 * their own (ENV 214 and PHY 214 are both valid). Hidden registration-only codes (upstream reg_fors such as
 * BIO 395 for CHE 430 A) are not: no export can resolve them, so they are reported invalid (search still finds
 * CHE 430 for "BIO 395").
 */
export async function validateCourseCodes(
  codes: readonly string[],
  terms?: readonly TermCode[],
): Promise<CodeValidation> {
  const resolved = await resolveTermsImpl();
  const scope = terms ? [...new Set(terms)].filter(isTermCode) : null;
  const toLoad = scope
    ? scope.filter((term) => inIngestWindow(term, resolved))
    : [...new Set([resolved.current, resolved.registration])];
  await Promise.all(toLoad.map((term) => ensureTermData(term, resolved)));

  const inputs = [...new Set(codes)];
  const normalized = new Map(inputs.map((input) => [input, normalizeCourseCode(input)]));
  const wellFormed = [...new Set(normalized.values())].filter((code) =>
    COURSE_CODE_PATTERN.test(code),
  );
  const found = new Set<string>();
  if (wellFormed.length > 0 && (!scope || scope.length > 0)) {
    await getDb();
    const termFilter = scope ? { termCode: trusted({ $in: scope }) } : {};
    const own = await CatalogSection.distinct("courseCode", {
      ...termFilter,
      courseCode: trusted({ $in: wellFormed }),
    });
    for (const code of own) found.add(String(code));
  }
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const input of inputs) {
    const code = normalized.get(input) ?? input;
    if (found.has(code)) {
      if (!valid.includes(code)) valid.push(code);
    } else {
      invalid.push(input);
    }
  }
  return { valid, invalid };
}

/** Distinct course codes in a term (landing-page stats, sidebar counts). */
export async function countCourses(term: TermCode): Promise<number> {
  assertTerm(term);
  const loaded = await loadTerm(term);
  return loaded?.index.courses.length ?? 0;
}

/** Canonical departments and requirement codes for a term (upstream course-schedule filters). */
export async function getCatalogFilters(term: TermCode): Promise<CatalogFilters> {
  assertTerm(term);
  const resolved = await resolveTermsImpl();
  const meta = await ensureTermData(term, resolved);
  return getCatalogFiltersImpl(term, resolved, meta);
}
