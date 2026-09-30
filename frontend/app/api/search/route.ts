import { searchApi } from "@/lib/api/search";
import { now } from "@/server/clock";
import { loadFlags } from "@/server/features";
import { defineRoute, isVerifiedDavidson } from "@/server/http";
import { search } from "@/server/search";

// GET /api/search?q=<text>&limit=<n ≤ 20> → { results } (contract: lib/api/search.ts). Flags are read like the
// shell reads them (loadFlags: a malformed flag takes its default), so search offers exactly the shown sections.
export const GET = defineRoute(searchApi.search, async ({ user, query }) => {
  let verified: Promise<boolean> | undefined;
  const results = await search(query.q, query.limit, {
    user,
    flags: loadFlags(),
    isVerifiedDavidson: () => (verified ??= isVerifiedDavidson(user.id)),
    now: now(),
  });
  return { results };
});
