import { z } from "zod";
import { apiRoute } from "@/lib/api/spec";
import {
  CourseCodeSchema,
  CrnSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  ObjectIdSchema,
  TermCodeSchema,
} from "@/lib/types/common";
import {
  DayScheduleSchema,
  PlanDraftSchema,
  PlanItemSchema,
  PlanItemSourceSchema,
  PlanProgressSchema,
  PlanStatusSchema,
  PlanViewSchema,
  PlanWarningSchema,
  ScheduleConflictSchema,
  StudentDeadlineSchema,
  SummerActivitySchema,
  WebTreeListSchema,
} from "@/lib/types/plan";

/**
 * Plan routes (W5s: app/api/plan/**). Signed-in users only, never cached. Mutations are atomic on the server
 * (PLAN §5 "Plan items"): add = findOneAndUpdate with `$not $elemMatch`, remove = `$pull` by id, patch = positional
 * `$set` on the whitelisted fields below. Adding the same code in another term is always allowed (retakes); the
 * response carries a warning ("Already completed in Fall 2025 — plan a retake?") instead of blocking. The same
 * (termCode, canonicalCode) twice among active items → 409 conflict.
 */

const IdParams = z.object({ id: ObjectIdSchema });

/** POST /api/plan/items. Title/credits/reqCodes come from the catalog for that term; a code in no ingested term is
 * accepted as a manual, `unverified` entry (manualTitle/manualCredits then apply; credits fallback 1, never 4). */
export const AddPlanItemBodySchema = z
  .object({
    termCode: TermCodeSchema.nullable(),
    courseCode: CourseCodeSchema,
    crn: CrnSchema.optional(),
    status: PlanStatusSchema.default("planned"),
    passFail: z.boolean().default(false),
    source: PlanItemSourceSchema.default("catalog"),
    manualTitle: z.string().trim().min(1).max(200).optional(),
    manualCredits: z.number().min(0).max(4).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type AddPlanItemBody = z.input<typeof AddPlanItemBodySchema>;
export type AddPlanItemInput = z.output<typeof AddPlanItemBodySchema>;

/** PATCH /api/plan/items/[id]: whitelisted fields only; `null` clears crn/note. */
export const UpdatePlanItemBodySchema = z
  .object({
    termCode: TermCodeSchema.nullable(),
    crn: CrnSchema.nullable(),
    status: PlanStatusSchema,
    passFail: z.boolean(),
    note: z.string().trim().max(500).nullable(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "Nothing to update.");
export type UpdatePlanItemBody = z.input<typeof UpdatePlanItemBodySchema>;
export type UpdatePlanItemInput = z.output<typeof UpdatePlanItemBodySchema>;

export const PlanItemResponseSchema = z.object({
  item: PlanItemSchema,
  warnings: z.array(PlanWarningSchema),
});

export const WebTreeQuerySchema = z.object({
  /** Default: the registration term. */
  term: TermCodeSchema.optional(),
});

export const WebTreeResponseSchema = z.object({
  list: WebTreeListSchema,
  /** Conflicts across choices and alternates (second meeting times included, TBA excluded). */
  conflicts: z.array(ScheduleConflictSchema),
  warnings: z.array(PlanWarningSchema),
});

export const CreateDeadlineBodySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    dueAt: IsoDateTimeSchema,
    courseCode: CourseCodeSchema.optional(),
  })
  .strict();

export const CreateSummerActivityBodySchema = SummerActivitySchema.omit({ id: true }).strict();
export const UpdateSummerActivityBodySchema = SummerActivitySchema.omit({ id: true })
  .partial()
  .strict();

/** Manual requirement inputs (language proficiency/exemption, PE checklist). */
export const UpdateManualBodySchema = PlanViewSchema.shape.manual.partial().strict();

export const planApi = {
  /** GET /api/plan → the whole plan (v2, or the in-memory conversion of a legacy v1 plan). */
  getPlan: apiRoute({
    method: "GET",
    path: "/api/plan",
    auth: "user",
    response: z.object({ plan: PlanViewSchema }),
  }),
  addItem: apiRoute({
    method: "POST",
    path: "/api/plan/items",
    auth: "user",
    body: AddPlanItemBodySchema,
    response: PlanItemResponseSchema,
    status: 201,
  }),
  updateItem: apiRoute({
    method: "PATCH",
    path: "/api/plan/items/[id]",
    auth: "user",
    params: IdParams,
    body: UpdatePlanItemBodySchema,
    response: PlanItemResponseSchema,
  }),
  removeItem: apiRoute({
    method: "DELETE",
    path: "/api/plan/items/[id]",
    auth: "user",
    params: IdParams,
    response: null,
  }),
  /** PATCH /api/plan/manual → language exemption / PE checklist. */
  updateManual: apiRoute({
    method: "PATCH",
    path: "/api/plan/manual",
    auth: "user",
    body: UpdateManualBodySchema,
    response: z.object({ manual: PlanViewSchema.shape.manual }),
  }),
  progress: apiRoute({
    method: "GET",
    path: "/api/plan/progress",
    auth: "user",
    response: z.object({ progress: PlanProgressSchema }),
  }),
  /** GET /api/plan/schedule?date=YYYY-MM-DD (America/New_York; default today) → the day's classes. */
  daySchedule: apiRoute({
    method: "GET",
    path: "/api/plan/schedule",
    auth: "user",
    query: z.object({ date: IsoDateSchema.optional() }),
    response: z.object({ schedule: DayScheduleSchema }),
  }),
  getWebTree: apiRoute({
    method: "GET",
    path: "/api/plan/webtree",
    auth: "user",
    query: WebTreeQuerySchema,
    response: WebTreeResponseSchema,
  }),
  /** PUT /api/plan/webtree → replace the ranked list for its term. */
  saveWebTree: apiRoute({
    method: "PUT",
    path: "/api/plan/webtree",
    auth: "user",
    body: WebTreeListSchema.strict(),
    response: WebTreeResponseSchema,
  }),
  listDeadlines: apiRoute({
    method: "GET",
    path: "/api/plan/deadlines",
    auth: "user",
    response: z.object({ deadlines: z.array(StudentDeadlineSchema) }),
  }),
  addDeadline: apiRoute({
    method: "POST",
    path: "/api/plan/deadlines",
    auth: "user",
    body: CreateDeadlineBodySchema,
    response: z.object({ deadline: StudentDeadlineSchema }),
    status: 201,
  }),
  removeDeadline: apiRoute({
    method: "DELETE",
    path: "/api/plan/deadlines/[id]",
    auth: "user",
    params: IdParams,
    response: null,
  }),
  listSummer: apiRoute({
    method: "GET",
    path: "/api/plan/summer",
    auth: "user",
    response: z.object({ activities: z.array(SummerActivitySchema) }),
  }),
  addSummer: apiRoute({
    method: "POST",
    path: "/api/plan/summer",
    auth: "user",
    body: CreateSummerActivityBodySchema,
    response: z.object({ activity: SummerActivitySchema }),
    status: 201,
  }),
  updateSummer: apiRoute({
    method: "PATCH",
    path: "/api/plan/summer/[id]",
    auth: "user",
    params: IdParams,
    body: UpdateSummerActivityBodySchema,
    response: z.object({ activity: SummerActivitySchema }),
  }),
  removeSummer: apiRoute({
    method: "DELETE",
    path: "/api/plan/summer/[id]",
    auth: "user",
    params: IdParams,
    response: null,
  }),
  /** GET /api/plan/drafts → AI drafts stored for the student (W6 creates them, W5s stores them). */
  listDrafts: apiRoute({
    method: "GET",
    path: "/api/plan/drafts",
    auth: "user",
    response: z.object({ drafts: z.array(PlanDraftSchema) }),
  }),
  /** PATCH /api/plan/drafts/[id] → accept (adds the items not yet in the plan) or dismiss a draft. */
  updateDraft: apiRoute({
    method: "PATCH",
    path: "/api/plan/drafts/[id]",
    auth: "user",
    params: IdParams,
    body: z.object({ status: z.enum(["accepted", "dismissed"]) }).strict(),
    response: z.object({ draft: PlanDraftSchema, added: z.array(PlanItemSchema) }),
  }),
} as const;
