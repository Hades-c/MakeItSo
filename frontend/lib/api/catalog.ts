import { z } from "zod";
import { apiRoute } from "@/lib/api/spec";
import {
  AvailabilitySchema,
  CatalogCronResultSchema,
  CatalogFiltersSchema,
  CatalogQuerySchema,
  CatalogSearchResultSchema,
  CourseSchema,
  ResolvedTermsSchema,
} from "@/lib/types/catalog";
import { CourseCodeSchema, IsoDateTimeSchema, queryList, TermCodeSchema } from "@/lib/types/common";
import { parseCourseSlug } from "@/lib/routes";

/**
 * Catalog routes (W1: app/api/catalog/**). Public, cookie-free and CDN-cached ("public-catalog"): the data is the
 * same for everyone. Server components call server/catalog directly; these routes serve client islands.
 */

/** "[code]" path segment in URL form ("CSC-221") → "CSC 221". */
export const CourseSlugParamSchema = z.string().transform((slug, ctx) => {
  const code = parseCourseSlug(slug);
  if (!code) {
    ctx.addIssue({ code: "custom", message: "must be a course such as CSC-221" });
    return z.NEVER;
  }
  return code;
});

export const CourseParamsSchema = z.object({ term: TermCodeSchema, code: CourseSlugParamSchema });

export const TermsResponseSchema = ResolvedTermsSchema;

export const CourseResponseSchema = z.object({
  course: CourseSchema,
  /** When this term's data was fetched ("Schedule data as of <time>"). */
  asOf: IsoDateTimeSchema.nullable(),
});

export const AvailabilityQuerySchema = z.object({
  code: CourseCodeSchema,
  /** Terms to report; default: every term from the first ingested through the term after registration. */
  terms: queryList(TermCodeSchema),
});

export const AvailabilityResponseSchema = z.object({
  code: CourseCodeSchema,
  availability: z.array(AvailabilitySchema),
});

export const FiltersQuerySchema = z.object({ term: TermCodeSchema.optional() });

export const catalogApi = {
  /** GET /api/catalog/terms → every term with current/registration resolved. */
  terms: apiRoute({
    method: "GET",
    path: "/api/catalog/terms",
    auth: "public",
    cache: "public-catalog",
    response: TermsResponseSchema,
  }),
  /** GET /api/catalog/search?term=&q=&dept=&req=&days=&after=&before=&openOnly=&level=&page=&pageSize= */
  search: apiRoute({
    method: "GET",
    path: "/api/catalog/search",
    auth: "public",
    cache: "public-catalog",
    query: CatalogQuerySchema,
    response: CatalogSearchResultSchema,
  }),
  /** GET /api/catalog/courses/202602/CSC-221 → the course with every section (404 when not offered). */
  course: apiRoute({
    method: "GET",
    path: "/api/catalog/courses/[term]/[code]",
    auth: "public",
    cache: "public-catalog",
    params: CourseParamsSchema,
    response: CourseResponseSchema,
  }),
  /** GET /api/catalog/availability?code=CSC%20221&terms=202601,202602 → per-term availability (PLAN §5). */
  availability: apiRoute({
    method: "GET",
    path: "/api/catalog/availability",
    auth: "public",
    cache: "public-catalog",
    query: AvailabilityQuerySchema,
    response: AvailabilityResponseSchema,
  }),
  /** GET /api/catalog/filters?term= → canonical department and requirement lists. */
  filters: apiRoute({
    method: "GET",
    path: "/api/catalog/filters",
    auth: "public",
    cache: "public-catalog",
    query: FiltersQuerySchema,
    response: CatalogFiltersSchema,
  }),
  /**
   * GET /api/cron/catalog (nightly Vercel Cron, `Authorization: Bearer $CRON_SECRET`): refresh the terms list and
   * every due term of the ingest window (the first run backfills 202201 → registration). 200 with `ok: false`
   * when a term failed; the stored data is kept.
   */
  cronRefresh: apiRoute({
    method: "GET",
    path: "/api/cron/catalog",
    auth: "cron",
    response: CatalogCronResultSchema,
  }),
} as const;
