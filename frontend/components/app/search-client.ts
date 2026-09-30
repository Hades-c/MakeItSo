/**
 * Client side of global search: the response contract and a fetcher for the command palette.
 *
 * Contract (PLAN §4.1.16, owned by lib/api/search.ts once it exists; this mirrors it exactly):
 *   GET /api/search?q=<text>&limit=<n ≤ 20>
 *   → { results: { kind: 'course'|'career'|'event'|'alumnus'|'page', id, title, subtitle?, href, source? }[] }
 * Until the route exists, 404/501, other errors and network failures all mean "Search is unavailable", and the
 * palette falls back to the course catalog (/courses?q=…).
 */
import { z } from "zod";
import { SOURCE_IDS } from "@/lib/sources";

export const SEARCH_RESULT_KINDS = ["course", "career", "event", "alumnus", "page"] as const;
export type SearchResultKind = (typeof SEARCH_RESULT_KINDS)[number];

/** Most results the API returns (and the palette asks for). */
export const SEARCH_LIMIT_MAX = 20;

/** The strict contract for one result. */
export const searchResultSchema = z.object({
  kind: z.enum(SEARCH_RESULT_KINDS),
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  href: z.string().min(1),
  source: z.enum(SOURCE_IDS).optional(),
});

export const searchResponseSchema = z.object({ results: z.array(searchResultSchema) });

export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;

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
const lenientResult = searchResultSchema.extend({
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
