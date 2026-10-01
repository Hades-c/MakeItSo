import * as z from "zod";
import { apiRoute } from "@/lib/api/spec";
import {
  aiResultSchema,
  AiFeatureSchema,
  AiProvenanceSchema,
  CareerPlanSchema,
  ColdEmailSchema,
  CourseAboutSchema,
  ProfessorSummarySchema,
} from "@/lib/types/ai";
import { InstructorSchema } from "@/lib/types/catalog";
import { CourseCodeSchema, SlugSchema, TermCodeSchema } from "@/lib/types/common";
import { PlanDraftSchema } from "@/lib/types/plan";

/**
 * AI routes (W6: app/api/ai/**; PLAN §6.1 W6). The generating routes are `auth: "user"` + `aiResult: true`: the
 * handler resolves AI_ENABLED, configuration, verification (@davidson.edu) and consent itself and RETURNS the
 * failure as an AiResult, so the student sees the specific kind (see lib/types/ai.ts "Wire format"):
 *
 *   export const POST = defineRoute(aiApi.courseAbout, async ({ user, body }) => {
 *     const flags = getFlags();
 *     const gate = aiGateFailure({
 *       enabled: flags.ai,
 *       configured: aiConfigured(),              // server/ai (W6)
 *       verified: await isVerifiedDavidson(user.id),
 *       consented: await hasAiConsent(user.id),  // aiConsentAt (W3's User field)
 *     });
 *     if (gate) return gate;                     // → 404/503/403 with { kind, message }
 *     return generateCourseAbout(body);          // → AiResult (ok 200, quota 429, refused 422, ...)
 *   });
 *
 * The client sends only ids: the server loads the profile, plan and catalog itself and sends the model only
 * allow-listed fields (server/ai/payloads.ts). Routes set `export const maxDuration = 120`. "Report this" and the
 * admin purge are ordinary routes (ApiErrorBody errors).
 */

/** Shared per term + course; no user regenerate (refreshes on input-hash change or TTL). */
export const CourseAboutBodySchema = z
  .object({ termCode: TermCodeSchema, courseCode: CourseCodeSchema })
  .strict();
export const CourseAboutResultSchema = aiResultSchema(
  z.object({ about: CourseAboutSchema, provenance: AiProvenanceSchema }),
);

/** Personal; `regenerate` counts against 3 regenerations/day. Result is stored as a PlanDraft. */
export const PlanSuggestionsBodySchema = z
  .object({ termCode: TermCodeSchema.optional(), regenerate: z.boolean().default(false) })
  .strict();
export const PlanSuggestionsResultSchema = aiResultSchema(z.object({ draft: PlanDraftSchema }));

export const CareerPlanBodySchema = z
  .object({ careerSlug: SlugSchema, regenerate: z.boolean().default(false) })
  .strict();
export const CareerPlanResultSchema = aiResultSchema(
  z.object({ plan: CareerPlanSchema, draft: PlanDraftSchema.nullable() }),
);

/** Only for contactable alumni; the body keeps the literal {{studentName}} placeholder. */
export const ColdEmailBodySchema = z
  .object({
    alumnusId: SlugSchema,
    careerSlug: SlugSchema.optional(),
    regenerate: z.boolean().default(false),
  })
  .strict();
export const ColdEmailResultSchema = aiResultSchema(z.object({ email: ColdEmailSchema }));

/** Only with RMP_SUMMARIES_ENABLED (else kind "disabled"). Shared per matched RMP profile. */
export const ProfessorSummaryBodySchema = z
  .object({ termCode: TermCodeSchema, courseCode: CourseCodeSchema, instructor: InstructorSchema })
  .strict();
export const ProfessorSummaryResultSchema = aiResultSchema(
  z.object({ summary: ProfessorSummarySchema, provenance: AiProvenanceSchema }),
);

/** "Report this" on a shared entry; hidden after 3 distinct reports. */
export const ReportBodySchema = z
  .object({
    feature: z.enum(["course-about", "professor-summary"]),
    key: z.string().min(1).max(200),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/** Admin purge of cached entries (ADMIN_EMAILS). Without `key`, purges every entry of the feature. */
export const PurgeBodySchema = z
  .object({ feature: AiFeatureSchema, key: z.string().min(1).max(200).optional() })
  .strict();

export const aiApi = {
  courseAbout: apiRoute({
    method: "POST",
    path: "/api/ai/course-about",
    auth: "user",
    aiResult: true,
    body: CourseAboutBodySchema,
    response: CourseAboutResultSchema,
  }),
  planSuggestions: apiRoute({
    method: "POST",
    path: "/api/ai/plan-suggestions",
    auth: "user",
    aiResult: true,
    body: PlanSuggestionsBodySchema,
    response: PlanSuggestionsResultSchema,
  }),
  careerPlan: apiRoute({
    method: "POST",
    path: "/api/ai/career-plan",
    auth: "user",
    aiResult: true,
    body: CareerPlanBodySchema,
    response: CareerPlanResultSchema,
  }),
  coldEmail: apiRoute({
    method: "POST",
    path: "/api/ai/cold-email",
    auth: "user",
    aiResult: true,
    body: ColdEmailBodySchema,
    response: ColdEmailResultSchema,
  }),
  professorSummary: apiRoute({
    method: "POST",
    path: "/api/ai/professor-summary",
    auth: "user",
    aiResult: true,
    body: ProfessorSummaryBodySchema,
    response: ProfessorSummaryResultSchema,
  }),
  report: apiRoute({
    method: "POST",
    path: "/api/ai/report",
    auth: "verified",
    body: ReportBodySchema,
    response: null,
  }),
  purge: apiRoute({
    method: "POST",
    path: "/api/ai/admin/purge",
    auth: "admin",
    body: PurgeBodySchema,
    response: z.object({ purged: z.number().int().min(0) }),
  }),
} as const;
