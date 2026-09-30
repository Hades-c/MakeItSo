import "server-only";
import type { SearchResult } from "@/lib/api/search";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: courses (owner W1). Stub until then: returns no results.
 * Matches course codes ("csc121" → CSC 121), titles, instructors and descriptions in the registration term; href routes.course(term, code); source "course-schedule".
 */
export async function search(
  _q: string,
  _limit: number,
  _ctx: SearchContext,
): Promise<SearchResult[]> {
  return [];
}
