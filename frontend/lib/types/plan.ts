import { z } from "zod";
import {
  CrossListingSchema,
  MeetingDaySchema,
  MeetingSchema,
  reqCodesOrNull,
} from "@/lib/types/catalog";
import {
  ClockTimeSchema,
  CourseCodeSchema,
  CrnSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  ObjectIdSchema,
  TermCodeSchema,
} from "@/lib/types/common";

/**
 * The student's plan (PLAN §4.1.4). Stored in the `plans` collection (v2, models/Plan.ts) by server/plan (W5s);
 * a legacy v1 `courseplans` document is converted in memory by `readLegacyPlan()` and never written.
 * No grades exist anywhere in MakeItSo. Domain rules: PLAN §5 "Credits & requirements", "Plan items",
 * "WebTree list".
 */

/** dropped / failed / withdrawn items are kept for history but never count and never block a re-add. */
export const PLAN_STATUSES = [
  "planned",
  "registered",
  "in-progress",
  "completed",
  "failed",
  "dropped",
  "withdrawn",
] as const;
export const PlanStatusSchema = z.enum(PLAN_STATUSES);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

/** Statuses that take part in the duplicate key (termCode, canonicalCode) and in credit/slot counting. */
export const ACTIVE_PLAN_STATUSES = [
  "planned",
  "registered",
  "in-progress",
  "completed",
] as const satisfies readonly PlanStatus[];

export const PlanItemSourceSchema = z.enum(["catalog", "manual", "transfer", "ap", "ai-draft"]);
export type PlanItemSource = z.infer<typeof PlanItemSourceSchema>;

/**
 * One course in the plan.
 * - termCode: null for pre-matriculation credit (AP/transfer) without a term.
 * - courseCode: the listing the student chose; canonicalCode: upper case, whitespace-normalised, cross-listing
 *   canonical (`canonicalCourseCode`), the duplicate key together with termCode.
 * - title / credits: from the catalog for that term; `unverified` when the code is in no ingested term (manual).
 * - reqCodes: from the listing registered under; null = no requirement data.
 * - passFail: elected P/F (warn at > 3 total or > 1 per term).
 */
export const PlanItemSchema = z.object({
  id: ObjectIdSchema,
  termCode: TermCodeSchema.nullable(),
  courseCode: CourseCodeSchema,
  canonicalCode: CourseCodeSchema,
  title: z.string().max(200),
  credits: z.number().min(0).max(4),
  crn: CrnSchema.optional(),
  status: PlanStatusSchema,
  passFail: z.boolean(),
  source: PlanItemSourceSchema,
  reqCodes: reqCodesOrNull(),
  unverified: z.boolean(),
  note: z.string().max(500).optional(),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

/**
 * Requirement slots the tracker shows (PLAN §5 (b)–(f)): COMP writing; the seven Ways of Knowing; CULT; JEC;
 * FRLG language (or a manual proficiency/exempt toggle); PE (manual checklist: 2 Lifetime Activity + 1 Team Sport).
 */
export const REQUIREMENT_SLOTS = [
  "COMP",
  "LTRQ",
  "HTRQ",
  "SSRQ",
  "NSRQ",
  "MQRQ",
  "PRRQ",
  "VPRQ",
  "CULT",
  "JEC",
  "FRLG",
  "PE",
] as const;
export const RequirementSlotSchema = z.enum(REQUIREMENT_SLOTS);
export type RequirementSlot = z.infer<typeof RequirementSlotSchema>;

/** done = a completed item fills it; this-term = an in-progress/registered item; planned = a planned item. */
export const SlotStatusSchema = z.enum(["done", "this-term", "planned", "open"]);
export type SlotStatus = z.infer<typeof SlotStatusSchema>;

export const PLAN_WARNING_CODES = [
  "writing-not-done-first-year",
  "pass-fail-total",
  "pass-fail-term",
  "restricted-standing",
  "comp-met-w-section",
  "permission-required",
  "already-completed",
  "nsci-verify",
  "no-requirement-data",
  "unverified-course",
  "time-conflict",
  "residence-note",
] as const;
export const PlanWarningSchema = z.object({
  code: z.enum(PLAN_WARNING_CODES),
  message: z.string(),
  itemId: ObjectIdSchema.optional(),
  termCode: TermCodeSchema.optional(),
});
export type PlanWarning = z.infer<typeof PlanWarningSchema>;

/**
 * Degree progress (unofficial — every widget says "Unofficial — verify in Degree Works").
 * - creditsDone: passing completed items (P counts; F, Fail, W and in-progress don't; 0-credit sections count 0).
 * - creditsPlanned: done + in-progress/registered + planned.
 * - reqs: status per slot after maximum bipartite matching (each course fills at most one WoK slot).
 * - filledBy: plan item ids filling each slot (for "fills X", "also tagged").
 */
export const PlanProgressSchema = z.object({
  creditsDone: z.number().min(0),
  creditsPlanned: z.number().min(0),
  required: z.literal(32),
  reqs: z.record(RequirementSlotSchema, SlotStatusSchema),
  filledBy: z.partialRecord(RequirementSlotSchema, z.array(ObjectIdSchema)),
  warnings: z.array(PlanWarningSchema),
});
export type PlanProgress = z.infer<typeof PlanProgressSchema>;

/** Ranked WebTree preferences for one (registration) term, with alternates per choice. Never automated. */
export const WebTreeChoiceSchema = z.object({
  rank: z.number().int().min(1).max(20),
  crn: CrnSchema,
  courseCode: CourseCodeSchema,
  alternates: z.array(CrnSchema).max(10),
});
export type WebTreeChoice = z.infer<typeof WebTreeChoiceSchema>;

export const WebTreeListSchema = z.object({
  termCode: TermCodeSchema,
  choices: z.array(WebTreeChoiceSchema).max(20),
});
export type WebTreeList = z.infer<typeof WebTreeListSchema>;

/** Two sections whose meetings overlap on a day (cross-listed siblings are one class and never conflict). */
export const ScheduleConflictSchema = z.object({
  a: z.object({ crn: CrnSchema, courseCode: CourseCodeSchema }),
  b: z.object({ crn: CrnSchema, courseCode: CourseCodeSchema }),
  day: MeetingDaySchema,
  /** The overlapping window. */
  start: ClockTimeSchema,
  end: ClockTimeSchema,
});
export type ScheduleConflict = z.infer<typeof ScheduleConflictSchema>;

/**
 * Input to `detectConflicts`: a section's identity and meetings (TBA meetings are ignored). A Section is a valid
 * ConflictInput. Two inputs are siblings (one class, never a conflict) when either lists the other's CRN in
 * `crossListings`; codes are not enough ("PHY 214" A and B pair with different ENV 214 sections).
 */
export const ConflictInputSchema = z.object({
  crn: CrnSchema,
  courseCode: CourseCodeSchema,
  crossListings: z.array(CrossListingSchema).default([]),
  meetings: z.array(MeetingSchema),
});
export type ConflictInput = z.input<typeof ConflictInputSchema>;

/**
 * An AI draft of plan items (W6 writes it, W5s stores it server-side). Items already in the plan are ticked off
 * per course, never per term. `basis` = "past-offerings" labels "Not yet scheduled — based on past offerings".
 */
export const PlanDraftSchema = z.object({
  id: ObjectIdSchema,
  kind: z.enum(["plan-suggestions", "career-plan"]),
  promptVersion: z.string(),
  items: z.array(
    z.object({
      termCode: TermCodeSchema,
      courseCode: CourseCodeSchema,
      reason: z.string().max(400),
      basis: z.enum(["scheduled", "past-offerings"]).optional(),
    }),
  ),
  status: z.enum(["pending", "accepted", "dismissed"]),
  createdAt: IsoDateTimeSchema,
});
export type PlanDraft = z.infer<typeof PlanDraftSchema>;

/** A summer plan entry (summer terms are selectable for plans, never a default). */
export const SummerActivitySchema = z.object({
  id: ObjectIdSchema,
  /** A summer code, YYYY03. */
  termCode: TermCodeSchema.refine((code) => code.endsWith("03"), "must be a summer term (YYYY03)"),
  title: z.string().min(1).max(120),
  kind: z.enum(["internship", "research", "course", "job", "study-abroad", "other"]),
  organization: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
});
export type SummerActivity = z.infer<typeof SummerActivitySchema>;

/** A student-entered deadline (Due soon on Today). */
export const StudentDeadlineSchema = z.object({
  id: ObjectIdSchema,
  title: z.string().min(1).max(120),
  dueAt: IsoDateTimeSchema,
  courseCode: CourseCodeSchema.optional(),
});
export type StudentDeadline = z.infer<typeof StudentDeadlineSchema>;

/** The whole plan as `getPlan()` returns it. `legacy` = converted from a v1 document, not yet written as v2. */
export const PlanViewSchema = z.object({
  items: z.array(PlanItemSchema),
  summer: z.array(SummerActivitySchema),
  deadlines: z.array(StudentDeadlineSchema),
  /** Manual requirement inputs: language proficiency/exemption, PE checklist. */
  manual: z.object({
    languageExempt: z.boolean(),
    pe: z.object({ lifetimeActivities: z.number().int().min(0).max(2), teamSport: z.boolean() }),
  }),
  legacy: z.boolean(),
  updatedAt: IsoDateTimeSchema.nullable(),
});
export type PlanView = z.infer<typeof PlanViewSchema>;

/**
 * One class meeting on a given day (`getDaySchedule`), for the Today timeline. startsAt/endsAt are absolute
 * instants for that date in America/New_York (DST-correct).
 */
export const DayScheduleEntrySchema = z.object({
  crn: CrnSchema,
  courseCode: CourseCodeSchema,
  title: z.string(),
  kind: MeetingSchema.shape.kind,
  start: ClockTimeSchema,
  end: ClockTimeSchema,
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  building: z.string().optional(),
  room: z.string().optional(),
});
export type DayScheduleEntry = z.infer<typeof DayScheduleEntrySchema>;

export const DayScheduleSchema = z.object({
  /** Calendar date in America/New_York. */
  date: IsoDateSchema,
  termCode: TermCodeSchema.nullable(),
  entries: z.array(DayScheduleEntrySchema),
  /** Chosen sections with only TBA meetings (not on the timeline). */
  tba: z.array(z.object({ crn: CrnSchema, courseCode: CourseCodeSchema, title: z.string() })),
  /** Why there are no entries, when there are none. */
  empty: z.enum(["weekend", "break", "no-term", "no-sections", "no-classes-today"]).nullable(),
});
export type DaySchedule = z.infer<typeof DayScheduleSchema>;

/** `readLegacyPlan()` result: the v1 document converted in memory (never written back). */
export const LegacyPlanConversionSchema = z.object({
  items: z.array(PlanItemSchema),
  summer: z.array(SummerActivitySchema),
  /** Entries that could not be converted (e.g. no semester/year), with why. */
  skipped: z.array(z.object({ courseCode: z.string(), reason: z.string() })),
  sourceUpdatedAt: IsoDateTimeSchema.nullable(),
});
export type LegacyPlanConversion = z.infer<typeof LegacyPlanConversionSchema>;
