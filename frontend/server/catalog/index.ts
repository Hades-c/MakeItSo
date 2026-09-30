import "server-only";
import type { TermCode } from "@/lib/term";
import type {
  Availability,
  CatalogFilters,
  CatalogQueryInput,
  CatalogSearchResult,
  CodeValidation,
  Course,
  ResolvedTerms,
  Section,
} from "@/lib/types/catalog";
import { notImplemented } from "@/server/http/errors";

/**
 * Course catalog service (PLAN §4.1.3; owner W1). FROZEN signatures: W1 replaces the bodies, callers code against
 * them now. Until W1 lands every function throws ApiError(501, "unavailable", "... is not implemented yet.").
 *
 * Data: the Davidson public course API through fetchExternal("course-schedule", ...), ingested into
 * catalogsections + catalogmeta (PLAN §5 "Catalog ingest": 202201 → registration term; never replace a non-empty
 * term with an empty or < 50%-size result). Codes are "HIS 357"; the URL form is lib/routes.ts courseSlug().
 */

export interface ResolveTermsOptions {
  /** Evaluate "current" and "registration" at this instant (default: `now()` from server/clock.ts, which is pinned
   * by FIXTURES_NOW in fixtures mode; never `new Date()` directly). */
  now?: Date;
}

/** Every known term with the current and registration terms resolved (lib/term.ts rules). Never throws for an
 * upstream outage once a terms list has been cached; falls back to termFromDateET when none ever was. */
export async function resolveTerms(_options: ResolveTermsOptions = {}): Promise<ResolvedTerms> {
  throw notImplemented("resolveTerms");
}

/** Search one term (default: registration term). See CatalogQuerySchema for filter semantics. */
export async function searchCourses(_query: CatalogQueryInput): Promise<CatalogSearchResult> {
  throw notImplemented("searchCourses");
}

/** All sections of `code` in `term`; null when the course is not offered (or the term is unpublished). */
export async function getCourse(_term: TermCode, _code: string): Promise<Course | null> {
  throw notImplemented("getCourse");
}

/** One section by CRN; null when it does not exist in that term. */
export async function getSection(_term: TermCode, _crn: string): Promise<Section | null> {
  throw notImplemented("getSection");
}

/**
 * Availability of `code` in every ingested term plus the unpublished terms through the one after registration
 * (PLAN §5 "Availability": offered / not-offered / not-yet-published + "usually offered").
 */
export async function getCourseHistory(_code: string): Promise<Availability[]> {
  throw notImplemented("getCourseHistory");
}

/** Split codes into those found in at least one of `terms` (default: every ingested term) and the rest. */
export async function validateCourseCodes(
  _codes: readonly string[],
  _terms?: readonly TermCode[],
): Promise<CodeValidation> {
  throw notImplemented("validateCourseCodes");
}

/** Distinct course codes in a term (landing-page stats, sidebar counts). */
export async function countCourses(_term: TermCode): Promise<number> {
  throw notImplemented("countCourses");
}

/** Canonical departments and requirement codes for a term (upstream course-schedule filters). */
export async function getCatalogFilters(_term: TermCode): Promise<CatalogFilters> {
  throw notImplemented("getCatalogFilters");
}
