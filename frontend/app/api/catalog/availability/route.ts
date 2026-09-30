import { AvailabilityResponseSchema, catalogApi } from "@/lib/api/catalog";
import { courseAvailabilityReport } from "@/server/catalog/history";
import { defineRoute, NO_STORE } from "@/server/http";

// GET /api/catalog/availability?code=CSC%20221&terms=202601,202602 → per-term availability (PLAN §5).
// CDN-cached once final; while history terms still wait for the backfill the answer will grow, so it is sent
// with `private, no-store` instead (defineRoute keeps a returned Response's own Cache-Control).
export const GET = defineRoute(catalogApi.availability, async ({ query }) => {
  const report = await courseAvailabilityReport(query.code, query.terms);
  const body = AvailabilityResponseSchema.parse({
    code: query.code,
    availability: report.availability,
  });
  if (report.complete) return body;
  return Response.json(body, { headers: { "Cache-Control": NO_STORE } });
});
