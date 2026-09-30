import "server-only";
import { z } from "zod";
import type { TermCode } from "@/lib/term";
import { fetchExternal } from "@/server/http/external";

/**
 * The Davidson public course API (api.davidson.edu), as W1 reads it (PLAN §5 "Terms", "Catalog ingest"). Only
 * `fetchExternal("course-schedule", …)` reaches it. Schemas are deliberately loose about extra fields and strict
 * about the fields we use; a single malformed section is dropped by the ingest instead of failing the whole term.
 */

export const API_ORIGIN = "https://api.davidson.edu";
export const TERMS_URL = `${API_ORIGIN}/api/public/v2/terms?limit=500`;
/** Page size of the courses endpoint (PLAN §5: limit=1000). */
export const COURSES_PAGE_SIZE = 1000;
/** Never fetch more than this many pages for one term (PLAN §5: cap 20). */
export const MAX_COURSE_PAGES = 20;

export function coursesUrl(term: TermCode, offset: number): string {
  return `${API_ORIGIN}/api/public/v2/courses?limit=${COURSES_PAGE_SIZE}&offset=${offset}&term_code=${term}`;
}

export function filtersUrl(term: TermCode): string {
  return `${API_ORIGIN}/micro/public/v2/course-schedule/filters/${term}`;
}

const text = z.string().nullish();
const idLike = z.union([z.number().int(), z.string()]);
/** Upstream dates: epoch milliseconds (UTC midnight) or an ISO string. */
const dateLike = z.union([z.number(), z.string()]).nullish();

// ---- Terms -----------------------------------------------------------------------------------------------------

export const UpstreamTermSchema = z.looseObject({
  term_code: idLike.transform(String),
  description: text,
  is_active: z.boolean().nullish(),
  is_next: z.boolean().nullish(),
  is_summer: z.boolean().nullish(),
  start_date: dateLike,
  end_date: dateLike,
});
export type UpstreamTerm = z.output<typeof UpstreamTermSchema>;

export const UpstreamTermsSchema = z.array(z.unknown());

// ---- Sections --------------------------------------------------------------------------------------------------

const MeetingSchema = z.looseObject({
  type: text,
  days: z.array(z.union([z.number(), z.string()])).nullish(),
  weekdays: text,
  start_time: text,
  end_time: text,
  room: text,
  building: z.looseObject({ code: text, description: text }).nullish(),
});

const ListingRefSchema = z.looseObject({
  crn: idLike,
  subject_code: z.string(),
  course_number: z.string(),
  section: z.string().nullish(),
  title: text,
});

export const UpstreamSectionSchema = z.looseObject({
  crn: idLike,
  subject: z.looseObject({ code: z.string(), description: text }),
  course_number: z.string(),
  section: z.string(),
  course_title: text,
  credits: z.union([z.number(), z.string()]).nullish(),
  course_description: text,
  instructors: z.array(z.looseObject({ first_name: text, last_name: text })).nullish(),
  meetings: z.array(MeetingSchema).nullish(),
  enrollment: z
    .looseObject({
      current: z.number().nullish(),
      max: z.number().nullish(),
      remaining: z.number().nullish(),
    })
    .nullish(),
  grad_requirements: z.array(z.looseObject({ code: z.string(), description: text })).nullish(),
  notes: z.array(z.looseObject({ code: text, description: text })).nullish(),
  cross_listings: z.array(ListingRefSchema).nullish(),
  cross_postings: z.array(z.string()).nullish(),
  reg_fors: z.array(ListingRefSchema).nullish(),
  term: z.looseObject({ code: idLike }).nullish(),
});
export type UpstreamSection = z.output<typeof UpstreamSectionSchema>;
export type UpstreamListingRef = z.output<typeof ListingRefSchema>;

/** One courses page: an array (items are validated one by one by the ingest). */
export const UpstreamSectionsPageSchema = z.array(z.unknown());

// ---- Filters ---------------------------------------------------------------------------------------------------

export const UpstreamFiltersSchema = z.looseObject({
  departments: z.array(z.looseObject({ code: z.string(), description: text })).default([]),
  grad_requirements: z.array(z.looseObject({ code: z.string(), description: text })).default([]),
});
export type UpstreamFilters = z.output<typeof UpstreamFiltersSchema>;

// ---- Fetching --------------------------------------------------------------------------------------------------

export interface FetchOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** One page of sections (raw items). Response headers such as x-next / x-record-count are ignored (PLAN §5). */
export type FetchSectionsPage = (
  term: TermCode,
  offset: number,
  options: FetchOptions,
) => Promise<unknown[]>;

export const fetchSectionsPage: FetchSectionsPage = async (term, offset, options) => {
  const { data } = await fetchExternal("course-schedule", coursesUrl(term, offset), {
    parse: "json",
    schema: UpstreamSectionsPageSchema,
    ...options,
  });
  return data;
};

export async function fetchTermsList(options: FetchOptions = {}): Promise<unknown[]> {
  const { data } = await fetchExternal("course-schedule", TERMS_URL, {
    parse: "json",
    schema: UpstreamTermsSchema,
    ...options,
  });
  return data;
}

export async function fetchFilters(
  term: TermCode,
  options: FetchOptions = {},
): Promise<UpstreamFilters> {
  const { data } = await fetchExternal("course-schedule", filtersUrl(term), {
    parse: "json",
    schema: UpstreamFiltersSchema,
    ...options,
  });
  return data;
}

export interface FetchedTerm {
  items: unknown[];
  pages: number;
  /** True when the page cap was reached with a full last page (the data may be incomplete). */
  truncated: boolean;
}

/**
 * Every section of a term: `limit=1000&offset=N`, stopping at the first short page (PLAN §5), at most
 * MAX_COURSE_PAGES requests. Duplicate CRNs across pages are the ingest's problem (it keys by CRN).
 */
export async function fetchAllSections(
  term: TermCode,
  fetchPage: FetchSectionsPage = fetchSectionsPage,
  options: FetchOptions = {},
): Promise<FetchedTerm> {
  const items: unknown[] = [];
  for (let page = 0; page < MAX_COURSE_PAGES; page++) {
    const batch = await fetchPage(term, page * COURSES_PAGE_SIZE, options);
    items.push(...batch);
    if (batch.length < COURSES_PAGE_SIZE) return { items, pages: page + 1, truncated: false };
  }
  return { items, pages: MAX_COURSE_PAGES, truncated: true };
}
