import { aiApi } from "@/lib/api/ai";
import { AI_REPORT_RATE_LIMIT, reportEntry } from "@/server/ai";
import { defineRoute } from "@/server/http";

// POST /api/ai/report { feature, key, reason? } → 204 (lib/api/ai.ts). "Report this" on a shared entry (key: the
// provenance.inputHash the student was shown); 3 distinct reporters hide it pending review. Verified
// @davidson.edu accounts only; 404 when the entry does not exist.
export const POST = defineRoute(
  { ...aiApi.report, rateLimit: AI_REPORT_RATE_LIMIT },
  async ({ user, body }) => {
    await reportEntry(user.id, body);
    return null;
  },
);
