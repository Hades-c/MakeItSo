import { CatalogCronResultSchema, runCatalogCron } from "@/server/catalog/cron";
import { defineRoute } from "@/server/http";

// A first run backfills every term since Fall 2022 (a few upstream requests each).
export const maxDuration = 300;

// GET /api/cron/catalog (Vercel Cron, Bearer CRON_SECRET): refresh the terms list and every due term.
export const GET = defineRoute(
  {
    method: "GET",
    path: "/api/cron/catalog",
    auth: "cron",
    response: CatalogCronResultSchema,
  },
  () => runCatalogCron(),
);
