import { catalogApi } from "@/lib/api/catalog";
import { searchCourses } from "@/server/catalog";
import { defineRoute } from "@/server/http";

// GET /api/catalog/search?term=&q=&dept=&req=&days=&after=&before=&openOnly=&level=&page=&pageSize=
// (public, CDN-cached; semantics in lib/types/catalog.ts CatalogQuerySchema and server/catalog/search.ts).
export const GET = defineRoute(catalogApi.search, ({ query }) => searchCourses(query));
