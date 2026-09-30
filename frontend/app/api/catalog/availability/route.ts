import { catalogApi } from "@/lib/api/catalog";
import { courseAvailability } from "@/server/catalog/history";
import { defineRoute } from "@/server/http";

// GET /api/catalog/availability?code=CSC%20221&terms=202601,202602 → per-term availability (PLAN §5).
export const GET = defineRoute(catalogApi.availability, async ({ query }) => ({
  code: query.code,
  availability: await courseAvailability(query.code, query.terms),
}));
