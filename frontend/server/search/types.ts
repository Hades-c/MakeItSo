import "server-only";
import type { SearchResult } from "@/lib/api/search";
import type { Flags } from "@/lib/flags";
import type { SessionUser } from "@/server/auth/session";

/**
 * Search provider contract (PLAN §4.1.16 search). Each file in server/search/providers/ exports
 * `search(q, limit, ctx)` returning at most `limit` results, best first. `q` is already trimmed, whitespace-
 * collapsed and non-empty. A provider must respect flags (return [] for a surface that is off) and gating
 * (alumni only when `await ctx.isVerifiedDavidson()`); it must never throw for "no results".
 */
export interface SearchContext {
  user: SessionUser;
  flags: Flags;
  /** Memoised per request. */
  isVerifiedDavidson: () => Promise<boolean>;
  now: Date;
}

export type SearchProvider = (
  q: string,
  limit: number,
  ctx: SearchContext,
) => Promise<SearchResult[]>;
