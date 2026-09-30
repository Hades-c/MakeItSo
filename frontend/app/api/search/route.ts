import { searchApi } from "@/lib/api/search";
import { getFlags } from "@/lib/flags";
import { now } from "@/server/clock";
import { defineRoute, isVerifiedDavidson } from "@/server/http";
import { search } from "@/server/search";

// GET /api/search?q=<text>&limit=<n ≤ 20> → { results } (contract: lib/api/search.ts).
export const GET = defineRoute(searchApi.search, async ({ user, query }) => {
  let verified: Promise<boolean> | undefined;
  const results = await search(query.q, query.limit, {
    user,
    flags: getFlags(),
    isVerifiedDavidson: () => (verified ??= isVerifiedDavidson(user.id)),
    now: now(),
  });
  return { results };
});
