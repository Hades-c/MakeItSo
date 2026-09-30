import { z } from "zod";
import {
  ClockTimeSchema,
  CourseCodeSchema,
  CrnSchema,
  HttpsUrlSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  queryBoolean,
  queryInt,
  queryList,
  queryText,
  TermCodeSchema,
} from "@/lib/types/common";

/**
 * Course catalog types (PLAN §4.1.2). Produced by server/catalog (W1) from the Davidson public course API
 * (`/api/public/v2/courses`, `/api/public/v2/terms`, `/micro/public/v2/course-schedule/filters/{term}`) and by
 * server/programs (W1b) from Acalog. Consumed by the course pages (W8), the plan (W5*), AI grounding (W6) and
 * careers (W9a). Domain rules: PLAN §5 "Catalog ingest", "Availability", "Sections", "Credits & requirements".
 */

// ---- Requirement codes -------------------------------------------------------------------------------------------

/**
 * Banner requirement codes as the course API sends them (`grad_requirements[].code`).
 * - NONE = approved for no requirement (a real answer).
 * - NSCI = legacy natural-science tag: show "verify" (PLAN §5 code semantics).
 * - A section with no requirement data has `reqCodes: null`, never `[]` or ["NONE"].
 */
export const REQ_CODES = [
  "CULT",
  "JEC",
  "LTRQ",
  "HTRQ",
  "SSRQ",
  "NSRQ",
  "MQRQ",
  "PRRQ",
  "VPRQ",
  "FRLG",
  "COMP",
  "NSCI",
  "NONE",
] as const;
export const ReqCodeSchema = z.enum(REQ_CODES);
export type ReqCode = z.infer<typeof ReqCodeSchema>;

/**
 * Requirement codes of a listing: at least one code, or null for "no requirement data" (never `[]`, so an empty
 * list can never be mistaken for NONE).
 */
export function reqCodesOrNull() {
  return z.array(ReqCodeSchema).min(1).nullable();
}

/** The seven Ways of Knowing slots; each course fills at most one (PLAN §5 (c)). */
export const WAYS_OF_KNOWING = ["LTRQ", "HTRQ", "SSRQ", "NSRQ", "MQRQ", "PRRQ", "VPRQ"] as const;

// ---- Sections ------------------------------------------------------------------------------------------------------

/** Meeting days: M T W R F S U (upstream sends 1 = Monday … 5 = Friday). */
export const MEETING_DAYS = ["M", "T", "W", "R", "F", "S", "U"] as const;
export const MeetingDaySchema = z.enum(MEETING_DAYS);
export type MeetingDay = z.infer<typeof MeetingDaySchema>;

/**
 * One meeting pattern of a section. Times are America/New_York wall-clock "HH:MM" parsed from upstream
 * `start_time`/`end_time` ("HHMM"); `class_time` is ignored. `tba` is true when `days` is empty or `start` is null:
 * show "Time TBA" and leave it out of conflicts and the timeline. `kind` maps upstream `type`:
 * "lecture" → class, "second meeting time" → second (included in conflicts).
 */
export const MeetingSchema = z.object({
  days: z.array(MeetingDaySchema),
  start: ClockTimeSchema.nullable(),
  end: ClockTimeSchema.nullable(),
  building: z.string().optional(),
  room: z.string().optional(),
  kind: z.enum(["class", "second", "lab", "other"]),
  tba: z.boolean(),
});
export type Meeting = z.infer<typeof MeetingSchema>;

/** An instructor in upstream order. `isStaff` = the "Staff" placeholder: show "Staff (TBA)", no RMP lookup. */
export const InstructorSchema = z.object({
  first: z.string(),
  last: z.string(),
  isStaff: z.boolean(),
});
export type Instructor = z.infer<typeof InstructorSchema>;

/** Raw seat counts. Display `max(0, remaining)`; a negative `remaining` means "Over-enrolled". */
export const EnrollmentSchema = z.object({
  current: z.number().int(),
  max: z.number().int(),
  remaining: z.number().int(),
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

/**
 * Registration restrictions parsed from section notes (PLAN §5 "Sections"). They FLAG, never block.
 * - eligibleYears: class years from codes 1, 12, 123, 23, 234, 3, 34, 4 (1 = first-year … 4 = senior);
 *   null = open to all years.
 * - untilFirstDay: the code had a trailing "+" (restriction lifts on the first day of class).
 * - permissionRequired: note code PRM.
 * - notIfCompMet: note code W (WRI courses are closed to students who met the writing requirement).
 */
export const SectionRestrictionsSchema = z.object({
  eligibleYears: z.array(z.number().int().min(1).max(4)).nullable(),
  untilFirstDay: z.boolean(),
  permissionRequired: z.boolean(),
  notIfCompMet: z.boolean(),
});
export type SectionRestrictions = z.infer<typeof SectionRestrictionsSchema>;

/**
 * One section of a course in one term (the listing the student registers under).
 * - courseCode: this listing's code ("HIS 357"); subject "HIS"; number "357"; section "A".
 * - title: per section (topics courses differ by section); HTML entities decoded.
 * - credits: this section's credits (0 for MUS ensembles and MIL labs, 2 for HUM 103/GRE 103, else 1).
 * - reqCodes: from THIS listing (codes come from the listing registered under); null = no data.
 * - prerequisitesText: the official "Prerequisites" block as plain text; null when there is none.
 * - descriptionText: HTML → text, leading "Instructor" paragraph and the Prerequisites block removed.
 * - notes: upstream note descriptions, verbatim, in upstream order (codes are parsed into `restrictions`).
 * - crossListings: course codes of the cross-listed siblings ("PSY 303"): one class, counted once. A listing with
 *   `enrollment.max === 0` shows "Register as <sibling>".
 * - crossPostings: department codes the course is also browsable under ("IGEN"); browse tags only.
 * - regFor: when this listing is a registration section for another course (upstream `reg_fors`), that course's
 *   code, shown as "Registration section for <title>"; else null.
 */
export const SectionSchema = z.object({
  crn: CrnSchema,
  termCode: TermCodeSchema,
  courseCode: CourseCodeSchema,
  subject: z.string().regex(/^[A-Z]{2,4}$/),
  number: z.string().regex(/^\d{3}[A-Z]?$/),
  section: z.string().min(1).max(4),
  title: z.string(),
  credits: z.number().min(0),
  instructors: z.array(InstructorSchema),
  meetings: z.array(MeetingSchema),
  enrollment: EnrollmentSchema,
  reqCodes: reqCodesOrNull(),
  prerequisitesText: z.string().nullable(),
  descriptionText: z.string(),
  notes: z.array(z.string()),
  restrictions: SectionRestrictionsSchema,
  crossListings: z.array(CourseCodeSchema),
  crossPostings: z.array(z.string()),
  regFor: CourseCodeSchema.nullable(),
});
export type Section = z.infer<typeof SectionSchema>;

/**
 * All sections of one course code in one term. `credits` = distinct section credit values (ascending);
 * `reqCodes` = union of the sections' codes ([] when no section has data).
 */
export const CourseSchema = z.object({
  termCode: TermCodeSchema,
  code: CourseCodeSchema,
  title: z.string(),
  sections: z.array(SectionSchema),
  credits: z.array(z.number().min(0)),
  reqCodes: z.array(ReqCodeSchema),
});
export type Course = z.infer<typeof CourseSchema>;

/** One search result row (a course in a term), cheap to render in a long list. */
export const CourseSummarySchema = z.object({
  termCode: TermCodeSchema,
  code: CourseCodeSchema,
  title: z.string(),
  credits: z.array(z.number().min(0)),
  reqCodes: z.array(ReqCodeSchema),
  sectionCount: z.number().int().min(0),
  /** Sum over sections of max(0, remaining). */
  openSeats: z.number().int().min(0),
  /** "First Last" of every non-staff instructor, deduplicated, upstream order. */
  instructorNames: z.array(z.string()),
  crossListings: z.array(CourseCodeSchema),
  /** True when at least one section has only TBA meetings. */
  hasTba: z.boolean(),
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

/**
 * Canonical code among cross-listed siblings (PLAN §5 "Plan items"): the alphabetically first of the listing's own
 * code and its crossListings, so every sibling maps to the same key ("BIO 331" + ["PSY 303"] → "BIO 331").
 */
export function canonicalCourseCode(code: string, crossListings: readonly string[] = []): string {
  return [code, ...crossListings].sort()[0] ?? code;
}

// ---- Queries -----------------------------------------------------------------------------------------------------

/** Course level filter: the hundreds digit of the course number ("100" = 100-level; "000" for e.g. MUS 012). */
export const CourseLevelSchema = z.enum(["000", "100", "200", "300", "400"]);
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

/**
 * Catalog search input (PLAN §4.1.2). Parses URL query objects (strings / repeated keys) and typed objects alike.
 * - term: omitted → the registration term.
 * - q: code ("csc121", "CSC 121"), title, description or any instructor name; whitespace-only = no filter.
 * - dept / req: OR within the list, AND across filters.
 * - days: the days the student is free — a section matches when every non-TBA meeting day is in the set.
 * - after / before: every non-TBA meeting starts at/after `after` and ends at/before `before`.
 * - openOnly: at least one section with remaining > 0.
 */
export const CatalogQuerySchema = z.object({
  term: TermCodeSchema.optional(),
  q: queryText(100),
  dept: queryList(z.string().regex(/^[A-Z]{2,4}$/)),
  req: queryList(ReqCodeSchema),
  days: queryList(MeetingDaySchema),
  after: ClockTimeSchema.optional(),
  before: ClockTimeSchema.optional(),
  openOnly: queryBoolean(false),
  level: queryList(CourseLevelSchema),
  page: queryInt(1, 1000, 1),
  pageSize: queryInt(1, 100, 25),
});
export type CatalogQuery = z.output<typeof CatalogQuerySchema>;
export type CatalogQueryInput = z.input<typeof CatalogQuerySchema>;

export const CatalogSearchResultSchema = z.object({
  term: TermCodeSchema,
  items: z.array(CourseSummarySchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** When the term's data was last fetched from upstream; null when never ingested. */
  asOf: IsoDateTimeSchema.nullable(),
});
export type CatalogSearchResult = z.infer<typeof CatalogSearchResultSchema>;

// ---- Terms, availability, filters --------------------------------------------------------------------------------

/**
 * One term as the app sees it (PLAN §4.1.2), built by `resolveTerms()`:
 * - isActive: this is the CURRENT term (`currentTermFrom`), not the raw upstream flag.
 * - isRegistration: this is the registration term (`registrationTermFrom`).
 * - published: at least one section has been ingested for the term.
 * - startDate / endDate: UTC calendar dates ("YYYY-MM-DD") of the upstream UTC-midnight stamps; format with
 *   `timeZone: "UTC"` if ever turned into a Date.
 */
export const TermInfoSchema = z.object({
  code: TermCodeSchema,
  label: z.string(),
  isActive: z.boolean(),
  isRegistration: z.boolean(),
  isSummer: z.boolean(),
  published: z.boolean(),
  startDate: IsoDateSchema.optional(),
  endDate: IsoDateSchema.optional(),
});
export type TermInfo = z.infer<typeof TermInfoSchema>;

/** `resolveTerms()` result. */
export const ResolvedTermsSchema = z.object({
  terms: z.array(TermInfoSchema),
  current: TermCodeSchema,
  registration: TermCodeSchema,
  /** When the terms list was last fetched; null when it came from the fallback rules only. */
  asOf: IsoDateTimeSchema.nullable(),
});
export type ResolvedTerms = z.infer<typeof ResolvedTermsSchema>;

/**
 * Whether a course runs in a term (PLAN §5 "Availability"). A published term is "offered" (with sectionCount) or
 * "not-offered". An unpublished future term is "not-yet-published", plus `usually` when the course ran in ≥2 of
 * the last 3 same-season terms. Never show a bare "Offered" for an unpublished term.
 */
export const AvailabilitySchema = z.object({
  termCode: TermCodeSchema,
  status: z.enum(["offered", "not-offered", "not-yet-published"]),
  sectionCount: z.number().int().min(0).optional(),
  usually: z
    .object({
      season: z.enum(["Fall", "Spring", "Summer"]),
      basedOn: z.array(TermCodeSchema),
    })
    .optional(),
});
export type Availability = z.infer<typeof AvailabilitySchema>;

/** Canonical department and requirement lists for a term (upstream course-schedule filters endpoint). */
export const CatalogFiltersSchema = z.object({
  term: TermCodeSchema,
  departments: z.array(z.object({ code: z.string(), name: z.string() })),
  requirements: z.array(z.object({ code: ReqCodeSchema, name: z.string() })),
});
export type CatalogFilters = z.infer<typeof CatalogFiltersSchema>;

/** `validateCourseCodes()` result: which codes exist in at least one of the given (default: ingested) terms. */
export const CodeValidationSchema = z.object({
  valid: z.array(CourseCodeSchema),
  invalid: z.array(z.string()),
});
export type CodeValidation = z.infer<typeof CodeValidationSchema>;

// ---- Academic programs (Acalog, W1b) -----------------------------------------------------------------------------

export const ProgramOfferingKindSchema = z.enum([
  "major",
  "minor",
  "interdisciplinary-minor",
  "concentration",
  "other",
]);
export type ProgramOfferingKind = z.infer<typeof ProgramOfferingKindSchema>;

/**
 * A department/program page from the Acalog catalog (`/widget-api/catalog/{id}/program/{id}`). Official
 * major/minor names (for onboarding and the AI enums) are the `offerings[].name` values. Requirement text is shown
 * verbatim (`requirementsText`), with parsed course lists only where Acalog structures them.
 */
export const AcademicProgramSchema = z.object({
  acalogId: z.number().int(),
  catalogId: z.number().int(),
  /** "2026-2027". */
  catalogYear: z.string().regex(/^\d{4}-\d{4}$/),
  name: z.string(),
  url: HttpsUrlSchema,
  offerings: z.array(
    z.object({
      kind: ProgramOfferingKindSchema,
      /** Official name, e.g. "Major in Computer Science (B.S. Degree)". */
      name: z.string(),
      /** Degree as Acalog prints it ("A.B.", "B.S.", "B.A. or B.S."); null when the offering names none. */
      degree: z.string().nullable(),
      requirementsText: z.string(),
      courseCodes: z.array(CourseCodeSchema),
    }),
  ),
  fetchedAt: IsoDateTimeSchema,
});
export type AcademicProgram = z.infer<typeof AcademicProgramSchema>;

/** Program list row. */
export const AcademicProgramSummarySchema = AcademicProgramSchema.pick({
  acalogId: true,
  name: true,
  catalogYear: true,
}).extend({
  offerings: z.array(z.object({ kind: ProgramOfferingKindSchema, name: z.string() })),
});
export type AcademicProgramSummary = z.infer<typeof AcademicProgramSummarySchema>;
