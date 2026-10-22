import { catalogApi } from "@/lib/api/catalog";
import { resolveTerms } from "@/server/catalog";
import { defineRoute } from "@/server/http";

// GET /api/catalog/terms → every term with current/registration resolved (public, CDN-cached).
export const GET = defineRoute(catalogApi.terms, () => resolveTerms());
