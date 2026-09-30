import { programsApi } from "@/lib/api/programs";
import { defineRoute } from "@/server/http";
import { listPrograms } from "@/server/programs";
import { ACALOG_CATALOG } from "@/server/programs/catalog-info";

// GET /api/programs?kind=major&kind=minor → { catalogYear, programs } (contract: lib/api/programs.ts).
// Public and CDN-cached: official names for onboarding, the profile and the AI enums.
export const GET = defineRoute(programsApi.list, async ({ query }) => ({
  catalogYear: ACALOG_CATALOG.year,
  programs: await listPrograms({ kinds: query.kind }),
}));
