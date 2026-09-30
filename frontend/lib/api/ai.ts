import { z } from "zod";
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
 * AI routes (W6: app/api/ai/**; PLAN §6.1 W6). Every route needs a verified @davidson.edu account (auth
 * "verified"), AI_ENABLED, configuration and consent; each answers with an AiResult body and the HTTP status from
 * AI_RESULT_STATUS. The client sends only ids: the server loads the profile, plan and catalog itself and sends the
 * model only allow-listed fields (server/ai/payloads.ts). Routes set `export const maxDuration = 120`.
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
    auth: "verified",
    body: CourseAboutBodySchema,
    response: CourseAboutResultSchema,
  }),
  planSuggestions: apiRoute({
    method: "POST",
    path: "/api/ai/plan-suggestions",
    auth: "verified",
    body: PlanSuggestionsBodySchema,
    response: PlanSuggestionsResultSchema,
  }),
  careerPlan: apiRoute({
    method: "POST",
    path: "/api/ai/career-plan",
    auth: "verified",
    body: CareerPlanBodySchema,
    response: CareerPlanResultSchema,
  }),
  coldEmail: apiRoute({
    method: "POST",
    path: "/api/ai/cold-email",
    auth: "verified",
    body: ColdEmailBodySchema,
    response: ColdEmailResultSchema,
  }),
  professorSummary: apiRoute({
    method: "POST",
    path: "/api/ai/professor-summary",
    auth: "verified",
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
