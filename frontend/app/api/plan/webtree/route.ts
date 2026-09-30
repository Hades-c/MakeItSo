import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { getWebTreeReport, saveWebTreeList } from "@/server/plan";

/**
 * GET /api/plan/webtree?term= (default: the registration term) → { list, conflicts, warnings } plus the report's
 * details, copyText and deadlines (beyond the contract, see server/plan/webtree.ts WebTreeReport).
 */
export const GET = defineRoute(planApi.getWebTree, async ({ user, query }) => {
  const report = await getWebTreeReport(user.id, query.term);
  return report;
});

/** PUT /api/plan/webtree → replace the ranked list for its term (400 with per-choice issues), then the report. */
export const PUT = defineRoute(planApi.saveWebTree, async ({ user, body }) => {
  const list = await saveWebTreeList(user.id, body);
  const report = await getWebTreeReport(user.id, list.termCode, { list });
  return report;
});
