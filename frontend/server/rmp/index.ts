import "server-only";
import type { Instructor } from "@/lib/types/catalog";
import type { InstructorRating, RosterSyncResult } from "@/lib/types/ratings";
import { notImplemented } from "@/server/http/errors";

/**
 * RateMyProfessors service (PLAN §4.1.7, §5 "Ratings (RMP)"; owner W2). FROZEN signatures: W2 replaces the
 * bodies; until then every function throws ApiError(501, "unavailable", "... is not implemented yet.").
 *
 * One weekly roster job (newSearch.teachers for schoolID U2Nob29sLTM5NjU=, first: 1000, no Basic header) through
 * fetchExternal("ratemyprofessors", ...) → rmpteachers. No per-view calls; matching never accepts surname-only.
 */

/** One rating per instructor, same order (Staff → "staff"; RMP_ENABLED off → every entry "disabled"). */
export async function getRatings(_instructors: readonly Instructor[]): Promise<InstructorRating[]> {
  throw notImplemented("getRatings");
}

/** Pull the whole Davidson roster and replace rmpteachers (keeps the old roster on failure). */
export async function syncRoster(): Promise<RosterSyncResult> {
  throw notImplemented("syncRoster");
}
