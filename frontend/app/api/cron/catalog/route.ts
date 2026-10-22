import { catalogApi } from "@/lib/api/catalog";
import { runCatalogCron } from "@/server/catalog/cron";
import { defineRoute } from "@/server/http";

// A first run backfills every term since Fall 2022 (a few upstream requests each).
export const maxDuration = 300;

// GET /api/cron/catalog (Vercel Cron, Bearer CRON_SECRET): refresh the terms list and every due term
// (catalogApi.cronRefresh in lib/api/catalog.ts).
export const GET = defineRoute(catalogApi.cronRefresh, () => runCatalogCron());
