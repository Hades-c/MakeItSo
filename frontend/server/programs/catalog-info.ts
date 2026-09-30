import "server-only";

/**
 * The Acalog catalog MakeItSo reads (PLAN §5 "Majors", §6.1 W1b). One catalog is pinned on purpose: requirements
 * depend on the catalog year, so moving to the next year's catalog is a deliberate change here, not something the
 * weekly sync decides.
 *
 * Source: https://catalog.davidson.edu/widget-api/catalog/4 → `{"id": 4, "legacy-id": 28, "name": "2026-2027
 * Catalog", "published": true}`, checked 2026-09-30. `legacy-id` is the `catoid` of the public catalog pages
 * (https://catalog.davidson.edu/preview_program.php?catoid=28&poid=<program legacy-id>).
 */
export const ACALOG_CATALOG = {
  id: 4,
  legacyId: 28,
  /** Same form as AcademicProgram.catalogYear ("YYYY-YYYY"). */
  year: "2026-2027",
} as const;

export const ACALOG_ORIGIN = "https://catalog.davidson.edu";

/** Page size used for the program list: the whole catalog fits in one page (52 programs on 2026-09-30). */
export const PROGRAM_LIST_PAGE_SIZE = 100;
/** At most this many list pages are read (a catalog of more than 500 programs is not Davidson's). */
export const PROGRAM_LIST_MAX_PAGES = 5;

/**
 * A program list with fewer entries than this is treated as a failed ingest (the 2026-2027 catalog lists 52), and
 * the last good copy is kept (PLAN §6.1 W1b).
 */
export const MIN_PROGRAM_COUNT = 45;

/** Program pages (requirement text) are cached this long before a read refreshes them (PLAN §6.1 W1b). */
export const PROGRAM_DETAIL_TTL_MS = 7 * 24 * 60 * 60_000;

/** The weekly sync refreshes changed program pages with this much parallelism... */
export const SYNC_DETAIL_CONCURRENCY = 4;
/** ...and starts no new page fetch after this long (the rest load lazily or on the next run). */
export const SYNC_DETAIL_BUDGET_MS = 40_000;

export function programListUrl(page?: number): string {
  const params = new URLSearchParams();
  if (page !== undefined && page > 1) params.set("page", String(page));
  params.set("page-size", String(PROGRAM_LIST_PAGE_SIZE));
  return `${ACALOG_ORIGIN}/widget-api/catalog/${ACALOG_CATALOG.id}/programs?${params.toString()}`;
}

export function programDetailUrl(acalogId: number): string {
  return `${ACALOG_ORIGIN}/widget-api/catalog/${ACALOG_CATALOG.id}/program/${acalogId}`;
}

/**
 * The public catalog page of a program (what students open to read the official text). Without a legacy id there
 * is no stable program URL, so the catalog's "Academic Fields" index (navoid 1340 on the catalog home page,
 * checked 2026-09-30) is the honest fallback.
 */
export function programPublicUrl(legacyId: number | null): string {
  if (legacyId === null) {
    return `${ACALOG_ORIGIN}/content.php?catoid=${ACALOG_CATALOG.legacyId}&navoid=1340`;
  }
  return `${ACALOG_ORIGIN}/preview_program.php?catoid=${ACALOG_CATALOG.legacyId}&poid=${legacyId}`;
}
