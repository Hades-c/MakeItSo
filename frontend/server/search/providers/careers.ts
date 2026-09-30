import "server-only";
import type { SearchResult } from "@/lib/api/search";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: careers (owner W4b/W9a). Stub until then: returns no results.
 * Matches career paths by name, cluster and summary (server/content/careers.ts); href routes.career(slug); only when flags.careers.
 */
export async function search(
  _q: string,
  _limit: number,
  _ctx: SearchContext,
): Promise<SearchResult[]> {
  return [];
}
