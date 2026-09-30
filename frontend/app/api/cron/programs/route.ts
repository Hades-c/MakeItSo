import { defineRoute } from "@/server/http";
import { syncPrograms } from "@/server/programs";
import { ProgramSyncResultSchema } from "@/server/programs/service";

// The sync reads the program list and at most a few changed program pages (8 s timeout each, 40 s budget).
export const maxDuration = 60;

// GET /api/cron/programs (weekly Vercel Cron, Authorization: Bearer $CRON_SECRET) → { ok, count, error?, pages? }.
// The spec is inline until lib/api/programs.ts gains `cron` (contract request); the shape matches the other cron
// routes (ok + count, 200 even when the upstream failed: the run itself is recorded with recordSync).
export const GET = defineRoute(
  { method: "GET", path: "/api/cron/programs", auth: "cron", response: ProgramSyncResultSchema },
  async () => syncPrograms(),
);
