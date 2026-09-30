import "server-only";
import type { SearchResult } from "@/lib/api/search";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: events (owner W4a). Stub until then: returns no results.
 * Matches upcoming feed items (server/feeds); href routes.events({ q }); source = the item's source; only when flags.events.
 */
export async function search(
  _q: string,
  _limit: number,
  _ctx: SearchContext,
): Promise<SearchResult[]> {
  return [];
}
