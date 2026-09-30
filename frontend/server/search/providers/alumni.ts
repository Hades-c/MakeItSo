import "server-only";
import type { SearchResult } from "@/lib/api/search";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: alumni (owner W4b/W9a). Stub until then: returns no results.
 * Matches verified alumni by name, organization and role; ONLY when flags.alumni and await ctx.isVerifiedDavidson(); href routes.alumni().
 */
export async function search(
  _q: string,
  _limit: number,
  _ctx: SearchContext,
): Promise<SearchResult[]> {
  return [];
}
