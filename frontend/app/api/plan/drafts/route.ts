import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { listDrafts } from "@/server/plan";

/** GET /api/plan/drafts → { drafts } (AI drafts W6 stored, newest first). */
export const GET = defineRoute(planApi.listDrafts, async ({ user }) => ({
  drafts: await listDrafts(user.id),
}));
