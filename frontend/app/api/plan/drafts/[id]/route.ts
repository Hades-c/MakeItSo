import { planApi } from "@/lib/api/plan";
import { defineRoute } from "@/server/http";
import { updateDraftStatus } from "@/server/plan";

/**
 * PATCH /api/plan/drafts/[id] → { draft, added }: accept (adds each draft course not in the plan yet, per course,
 * through the validated add) or dismiss.
 */
export const PATCH = defineRoute(planApi.updateDraft, async ({ user, params, body }) =>
  updateDraftStatus(user.id, params.id, body.status),
);
