import { catalogApi } from "@/lib/api/catalog";
import { getCatalogFilters, resolveTerms } from "@/server/catalog";
import { defineRoute } from "@/server/http";

// GET /api/catalog/filters?term= → canonical departments and requirements (default: the registration term).
export const GET = defineRoute(catalogApi.filters, async ({ query }) =>
  getCatalogFilters(query.term ?? (await resolveTerms()).registration),
);
