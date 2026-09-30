import { z } from "zod";
import { apiRoute } from "@/lib/api/spec";
import { AppPathSchema, queryInt, queryText, SourceIdSchema } from "@/lib/types/common";

/**
 * Global search for the ⌘K CommandPalette (PLAN §3, §4.1.16). FROZEN — the palette is built against it:
 *
 *   GET /api/search?q=<text>&limit=<n ≤ 20>
 *   → { results: { kind: 'course'|'career'|'event'|'alumnus'|'page', id: string, title: string,
 *                  subtitle?: string, href: string, source?: SourceId }[] }
 *
 * - auth: signed in (401 otherwise); Cache-Control: private, no-store.
 * - q: trimmed, whitespace collapsed, ≤ 200 chars; empty/whitespace-only → `results: []`.
 * - limit: 1–20, default 8; above 20 → 400 validation_failed.
 * - results are interleaved across providers (server/search/providers/*), best first; `href` is an app path.
 * - alumni results appear only for verified @davidson.edu accounts (PLAN §1); flagged-off surfaces never appear.
 */

export const SEARCH_RESULT_KINDS = ["course", "career", "event", "alumnus", "page"] as const;
export const SearchResultKindSchema = z.enum(SEARCH_RESULT_KINDS);
export type SearchResultKind = z.infer<typeof SearchResultKindSchema>;

export const SearchResultSchema = z
  .object({
    kind: SearchResultKindSchema,
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    href: AppPathSchema,
    source: SourceIdSchema.optional(),
  })
  .strict();
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SEARCH_DEFAULT_LIMIT = 8;
export const SEARCH_MAX_LIMIT = 20;
export const SEARCH_MAX_QUERY_LENGTH = 200;

export const SearchQuerySchema = z.object({
  q: queryText(SEARCH_MAX_QUERY_LENGTH),
  limit: queryInt(1, SEARCH_MAX_LIMIT, SEARCH_DEFAULT_LIMIT),
});
export type SearchQuery = z.output<typeof SearchQuerySchema>;

export const SearchResponseSchema = z.object({ results: z.array(SearchResultSchema) });
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const searchApi = {
  search: apiRoute({
    method: "GET",
    path: "/api/search",
    auth: "user",
    cache: "private",
    query: SearchQuerySchema,
    response: SearchResponseSchema,
  }),
} as const;
