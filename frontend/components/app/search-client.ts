/**
 * Client side of global search: a lenient reader of the /api/search contract and a fetcher for the command palette.
 *
 * The contract itself is frozen in lib/api/search.ts (PLAN §4.1.16):
 *   GET /api/search?q=<text>&limit=<n ≤ 20>
 *   → { results: { kind: 'course'|'career'|'event'|'alumnus'|'page', id, title, subtitle?, href, source? }[] }
 * 404/501, other errors and network failures all mean "Search is unavailable", and the palette falls back to the
 * course catalog (/courses?q=…).
 */
import { z } from "zod";
import {
  SEARCH_MAX_LIMIT,
  SEARCH_RESULT_KINDS,
  SearchResponseSchema,
  SearchResultSchema,
  type SearchResponse,
  type SearchResult,
  type SearchResultKind,
} from "@/lib/api/search";
import { SOURCE_IDS } from "@/lib/sources";

export { SEARCH_RESULT_KINDS };
export type { SearchResponse, SearchResult, SearchResultKind };

/** Most results the API returns (and the palette asks for). */
export const SEARCH_LIMIT_MAX = SEARCH_MAX_LIMIT;

/** The strict contract for one result (re-exported from lib/api/search.ts). */
export const searchResultSchema = SearchResultSchema;
export const searchResponseSchema = SearchResponseSchema;

/** Same-origin paths only ("/courses/202602/HIS-357"): never another origin, protocol-relative or javascript:. */
export function isInternalHref(href: string): boolean {
  if (!/^\/(?![/\\])\S*$/.test(href)) return false;
  for (let i = 0; i < href.length; i++) {
    const code = href.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

// The reader is lenient where the contract is strict: one bad row, or a source id this build does not know yet,
// must not blank the whole palette. Bad rows are dropped; an unknown source drops only the tag.
// z.object over the shape (not .extend) so extra keys are stripped rather than rejected by the strict contract.
const lenientResult = z.object({
  ...searchResultSchema.shape,
  source: z.enum(SOURCE_IDS).optional().catch(undefined),
});

/** Results from an /api/search body, or null when the body is not a search response at all. */
export function parseSearchResponse(body: unknown): SearchResult[] | null {
  const envelope = z.object({ results: z.array(z.unknown()) }).safeParse(body);
  if (!envelope.success) return null;
  const results: SearchResult[] = [];
  for (const row of envelope.data.results) {
    const parsed = lenientResult.safeParse(row);
    if (!parsed.success || !isInternalHref(parsed.data.href)) continue;
    const { source, ...rest } = parsed.data;
    results.push(source ? { ...rest, source } : rest);
    if (results.length >= SEARCH_LIMIT_MAX) break;
  }
  return results;
}

/** Search could not run: no route yet (404/501), a server error, a network failure or a malformed body. */
export class SearchUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Search is unavailable (${reason})`);
    this.name = "SearchUnavailableError";
  }
}

export type SearchFn = (query: string, signal: AbortSignal) => Promise<SearchResult[]>;

/** The catalog fallback for a query: "/courses?q=organic+chemistry". */
export function courseSearchHref(query: string): string {
  const q = query.trim();
  return q ? `/courses?${new URLSearchParams({ q })}` : "/courses";
}

/** GET /api/search. Rejects with SearchUnavailableError (or the AbortError when the query changed). */
export const fetchSearch: SearchFn = async (query, signal) => {
  const params = new URLSearchParams({ q: query, limit: String(SEARCH_LIMIT_MAX) });
  let response: Response;
  try {
    response = await fetch(`/api/search?${params}`, {
      signal,
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new SearchUnavailableError("network");
  }
  if (!response.ok) throw new SearchUnavailableError(String(response.status));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SearchUnavailableError("invalid JSON");
  }
  const results = parseSearchResponse(body);
  if (!results) throw new SearchUnavailableError("unexpected response");
  return results;
};
