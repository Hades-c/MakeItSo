import "server-only";
import { z } from "zod";
import { ReqCodeSchema, WAYS_OF_KNOWING, type ReqCode } from "@/lib/types/catalog";
import { CourseCodeSchema, HttpsUrlSchema, IsoDateSchema } from "@/lib/types/common";
import { RequirementSlotSchema, type RequirementSlot } from "@/lib/types/plan";
import { parseTermCode, type TermCode } from "@/lib/term";
import { defineContentObject } from "@/server/content/define";

/**
 * Davidson's official graduation requirements, as the requirements engine (W5, server/plan/requirements.ts)
 * reads them: requirement codes with their official names, and the degree rules keyed by catalog year, each rule
 * with its source and the regulation's own words. Nothing here is inferred from the course data except the code
 * labels the course API itself sends.
 *
 * Sources (all fetched 2026-09-30):
 * - Academic Regulations 2026-2027 (Registrar, June 2026), "Requirements for Completion of A.B. and B.S. Degrees",
 *   "Majors, Minors, and Interdisciplinary Minors", "Pass/Fail Option" and "Transfer Credit";
 * - Academic Regulations 2025-2026 (Registrar, August 2025, updated October 13, 2025): the same rules, word for word;
 * - the Registrar's Graduation Requirements and Ways of Knowing Requirements pages;
 * - the course API's requirement filter list (`/micro/public/v2/course-schedule/filters/{term}`) for the labels.
 *
 * "All incoming first-year students should follow the Academic Regulations at the time of matriculation": pick
 * the rules with catalogYearForTerm(firstTerm) and resolveGraduationRules(). Every widget built on this says
 * "Unofficial — verify in Degree Works" (REQUIREMENTS_DISCLAIMER).
 */

const REGULATIONS_2026_27 = "https://www.davidson.edu/media/15696/download?attachment";
const REGULATIONS_2025_26 = "https://www.davidson.edu/media/13930/download?attachment=";
const REGULATIONS_ONLINE =
  "https://www.davidson.edu/offices-and-services/registrar/academic-regulations";
const GRADUATION_REQUIREMENTS =
  "https://www.davidson.edu/offices-and-services/registrar/graduation-requirements";
const WAYS_OF_KNOWING_PAGE =
  "https://www.davidson.edu/offices-and-services/registrar/graduation-requirements/ways-knowing-requirements";
const REQUIREMENT_FILTERS =
  "https://api.davidson.edu/micro/public/v2/course-schedule/filters/202602";
const COURSES_202601 =
  "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601";

export const REQUIREMENTS_DISCLAIMER = "Unofficial — verify in Degree Works";
export const REQUIREMENTS_VERIFIED_AT = "2026-09-30";

// ---- Requirement codes -------------------------------------------------------------------------------------------

export const REQUIREMENT_KINDS = [
  "ways-of-knowing",
  "cultural-diversity",
  "justice-equality-community",
  "language",
  "writing",
  "legacy",
  "none",
] as const;

export const RequirementCodeInfoSchema = z
  .object({
    code: ReqCodeSchema,
    /** The label the course API sends with the code (`grad_requirements[].description`). */
    apiLabel: z.string().min(1),
    /** The official name in the Academic Regulations. */
    name: z.string().min(1),
    kind: z.enum(REQUIREMENT_KINDS),
    /** The tracker slot the code can fill; null for NONE and the legacy NSCI (show "verify"). */
    slot: RequirementSlotSchema.nullable(),
    sources: z.array(HttpsUrlSchema).min(1),
  })
  .strict();
export type RequirementCodeInfo = z.infer<typeof RequirementCodeInfoSchema>;

function codeInfo(
  code: ReqCode,
  apiLabel: string,
  name: string,
  kind: RequirementCodeInfo["kind"],
  slot: RequirementSlot | null,
  sources: string[] = [REQUIREMENT_FILTERS, REGULATIONS_2026_27],
): RequirementCodeInfo {
  return defineContentObject(`requirements:${code}`, RequirementCodeInfoSchema, {
    code,
    apiLabel,
    name,
    kind,
    slot,
    sources,
  });
}

/** Every Banner requirement code the course API sends, with its official name and slot. */
export const REQUIREMENT_CODES: Readonly<Record<ReqCode, RequirementCodeInfo>> = Object.freeze({
  CULT: codeInfo("CULT", "Cultural Diversity", "Cultural Diversity", "cultural-diversity", "CULT"),
  JEC: codeInfo(
    "JEC",
    "Justice, Equality, & Community",
    "Justice, Equality, and Community",
    "justice-equality-community",
    "JEC",
  ),
  LTRQ: codeInfo(
    "LTRQ",
    "Lit, Creative Wri, Rhetoric",
    "Literary Studies, Creative Writing, and Rhetoric",
    "ways-of-knowing",
    "LTRQ",
  ),
  HTRQ: codeInfo("HTRQ", "Historical Thought", "Historical Thought", "ways-of-knowing", "HTRQ"),
  SSRQ: codeInfo(
    "SSRQ",
    "Social-Scientific Thought",
    "Social-Scientific Thought",
    "ways-of-knowing",
    "SSRQ",
  ),
  NSRQ: codeInfo("NSRQ", "Natural Science", "Natural Science", "ways-of-knowing", "NSRQ"),
  MQRQ: codeInfo(
    "MQRQ",
    "Math & Quantitative Thought",
    "Mathematical and Quantitative Thought",
    "ways-of-knowing",
    "MQRQ",
  ),
  PRRQ: codeInfo(
    "PRRQ",
    "Phil & Religious Perspectives",
    "Philosophical and Religious Perspectives",
    "ways-of-knowing",
    "PRRQ",
  ),
  VPRQ: codeInfo(
    "VPRQ",
    "Visual & Performing Arts",
    "Visual and Performing Arts",
    "ways-of-knowing",
    "VPRQ",
  ),
  FRLG: codeInfo("FRLG", "Language Requirement", "Language", "language", "FRLG"),
  COMP: codeInfo("COMP", "Writing Requirement", "Writing (Composition)", "writing", "COMP"),
  // Not in the filter list: the course API still sends it on a few Fall 2026 sections (PLAN §5: "legacy, verify").
  NSCI: codeInfo(
    "NSCI",
    "Natural Science Requirement",
    "Natural Science Requirement (legacy code; verify in Degree Works)",
    "legacy",
    null,
    [COURSES_202601],
  ),
  NONE: codeInfo(
    "NONE",
    "None - not approved for W.O.K.",
    "Not approved for any Ways of Knowing requirement",
    "none",
    null,
    [COURSES_202601],
  ),
});

export function requirementCodeInfo(code: ReqCode): RequirementCodeInfo {
  return REQUIREMENT_CODES[code];
}

/** Official requirement name for a code ("Mathematical and Quantitative Thought"). */
export function requirementName(code: ReqCode): string {
  return REQUIREMENT_CODES[code].name;
}

/** Codes that fill a tracker slot (all but NONE and NSCI). */
export function slotForCode(code: ReqCode): RequirementSlot | null {
  return REQUIREMENT_CODES[code].slot;
}

// ---- Graduation rules ---------------------------------------------------------------------------------------------

const RuleSourceSchema = z
  .object({
    url: HttpsUrlSchema,
    /** Section heading in the source ("Writing"). */
    section: z.string().min(1),
  })
  .strict();

/** A rule's provenance: where it is written and its exact words (shown verbatim in the tracker's details). */
const RuleTextSchema = { text: z.string().min(1), source: RuleSourceSchema };

const WayOfKnowingSchema = z
  .object({
    code: z.enum(WAYS_OF_KNOWING),
    name: z.string().min(1),
    /** Natural Science courses must be laboratory courses. */
    laboratory: z.boolean(),
  })
  .strict();

export const CatalogYearSchema = z.string().regex(/^\d{4}-\d{4}$/, "must be like 2026-2027");

export const GraduationRulesSchema = z
  .object({
    catalogYear: CatalogYearSchema,
    title: z.string().min(1),
    sources: z.array(HttpsUrlSchema).min(1),
    verifiedAt: IsoDateSchema,
    credits: z
      .object({
        /** Davidson counts courses: 32 to graduate (section credits come from the course API). */
        required: z.literal(32),
        /** One-half of the 32 in residence at Davidson ... */
        residenceFraction: z.literal(0.5),
        /** ... including the senior year: at least the final seven courses. */
        residenceFinalCourses: z.literal(7),
        /** Courses in off-campus programs officially sponsored by Davidson count as residence. */
        sponsoredOffCampusIsResidence: z.literal(true),
        ...RuleTextSchema,
      })
      .strict(),
    writing: z
      .object({
        code: z.literal("COMP"),
        slot: z.literal("COMP"),
        /** Either a WRI 101 course or the second semester of the Humanities Program. */
        courses: z.array(CourseCodeSchema).min(1),
        /** Complete it by the end of the first year at Davidson (warn after that). */
        completeBy: z.literal("end-of-first-year"),
        /** AP or other pre-matriculation credit never satisfies it. */
        preMatriculationCounts: z.literal(false),
        ...RuleTextSchema,
      })
      .strict(),
    waysOfKnowing: z
      .object({
        slots: z.array(WayOfKnowingSchema).length(7),
        coursesRequired: z.literal(7),
        /** "No single course satisfies more than one Ways of Knowing Requirement." */
        maxSlotsPerCourse: z.literal(1),
        /** At most two pre-matriculation credits (AP, IB, dual enrollment, transfer before matriculation). */
        preMatriculationMaxCredits: z.literal(2),
        /** A WoK course may also satisfy CULT or JEC (and major/minor requirements). */
        mayAlsoFill: z.array(z.enum(["CULT", "JEC"])),
        ...RuleTextSchema,
      })
      .strict(),
    culturalDiversity: z
      .object({
        code: z.literal("CULT"),
        slot: z.literal("CULT"),
        coursesRequired: z.literal(1),
        mayOverlapWaysOfKnowing: z.literal(true),
        ...RuleTextSchema,
      })
      .strict(),
    justiceEqualityCommunity: z
      .object({
        code: z.literal("JEC"),
        slot: z.literal("JEC"),
        coursesRequired: z.literal(1),
        mayOverlapWaysOfKnowing: z.literal(true),
        ...RuleTextSchema,
      })
      .strict(),
    language: z
      .object({
        code: z.literal("FRLG"),
        slot: z.literal("FRLG"),
        /** The third-semester level: 201 or higher. */
        minCourseNumber: z.literal(201),
        /** The Davidson languages that count (course API subject codes). */
        languages: z
          .array(z.object({ subject: z.string().regex(/^[A-Z]{2,4}$/), name: z.string() }).strict())
          .min(1),
        /** Subjects that never satisfy it (the Self-Instructional Language Program). */
        excludedSubjects: z
          .array(
            z.object({ subject: z.string().regex(/^[A-Z]{2,4}$/), reason: z.string() }).strict(),
          )
          .min(1),
        /** Other ways to satisfy it: the manual "proficiency/exempt" toggle in the tracker. */
        alternatives: z.array(z.string().min(1)).min(1),
        recommendedBefore: z.string(),
        ...RuleTextSchema,
      })
      .strict(),
    physicalEducation: z
      .object({
        slot: z.literal("PE"),
        lifetimeActivity: z.literal(2),
        teamSport: z.literal(1),
        /** Non-credit courses: they add no credits. */
        creditBearing: z.literal(false),
        /** PE is not in the course API: the tracker uses a manual checklist. */
        inCourseApi: z.literal(false),
        recommendedBy: z.string(),
        ...RuleTextSchema,
      })
      .strict(),
    passFail: z
      .object({
        /** Elected Pass/Fail courses: at most three ... */
        maxElected: z.literal(3),
        /** ... and at most one in any semester. */
        maxPerSemester: z.literal(1),
        /** Not counted toward the three: courses designated P/F by the instructor or department, transfer credit. */
        notCounted: z.array(z.string().min(1)),
        /** Pass = C- or better. */
        passMinimumGrade: z.literal("C-"),
        /** P/F courses satisfy every requirement except major, minor and interdisciplinary-minor requirements. */
        satisfiesMajorMinor: z.literal(false),
        designationDeadline: z.string(),
        ...RuleTextSchema,
      })
      .strict(),
    preMatriculation: z
      .object({
        /** Entering first-year students may transfer at most four credits taken before matriculation. */
        maxCredits: z.literal(4),
        /** Of those, at most two may fill Ways of Knowing slots (the student picks which two). */
        waysOfKnowingMaxCredits: z.literal(2),
        ...RuleTextSchema,
      })
      .strict(),
    major: z
      .object({
        /** Average of 2.0 in the courses counted toward the major. */
        minGpa: z.literal(2),
        declareBy: z.string(),
        ...RuleTextSchema,
      })
      .strict(),
    minor: z.object({ declareBy: z.string(), ...RuleTextSchema }).strict(),
  })
  .strict();
export type GraduationRules = z.infer<typeof GraduationRulesSchema>;

/** The rule text shared by 2025-26 and 2026-27 (the two editions are identical for these sections). */
function rulesFrom(
  catalogYear: string,
  title: string,
  regulations: string,
): z.input<typeof GraduationRulesSchema> {
  const from = (section: string) => ({ url: regulations, section });
  return {
    catalogYear,
    title,
    sources: [regulations, GRADUATION_REQUIREMENTS, WAYS_OF_KNOWING_PAGE, REGULATIONS_ONLINE],
    verifiedAt: REQUIREMENTS_VERIFIED_AT,
    credits: {
      required: 32,
      residenceFraction: 0.5,
      residenceFinalCourses: 7,
      sponsoredOffCampusIsResidence: true,
      text:
        "Complete satisfactorily 32 courses, one-half in residence at Davidson College. The period of residence " +
        "must include the senior year (at least the final seven courses). Courses in off-campus programs " +
        "officially sponsored by Davidson College are considered to be courses in residence.",
      source: from("Requirements for Completion of A.B. and B.S. Degrees: Residency"),
    },
    writing: {
      code: "COMP",
      slot: "COMP",
      courses: ["WRI 101", "HUM 104"],
      completeBy: "end-of-first-year",
      preMatriculationCounts: false,
      text:
        "Complete the Writing (Composition) Requirement by completing successfully by the end of the first year " +
        "at Davidson College either a WRI 101 course or the second semester of the Humanities Program (HUM 104). " +
        "Advanced Placement or other credits completed prior to college matriculation do not satisfy the writing " +
        "requirement.",
      source: from("Requirements for Completion of A.B. and B.S. Degrees: Writing"),
    },
    waysOfKnowing: {
      slots: [
        {
          code: "LTRQ",
          name: "Literary Studies, Creative Writing, and Rhetoric",
          laboratory: false,
        },
        { code: "HTRQ", name: "Historical Thought", laboratory: false },
        { code: "SSRQ", name: "Social-Scientific Thought", laboratory: false },
        { code: "NSRQ", name: "Natural Science", laboratory: true },
        { code: "MQRQ", name: "Mathematical and Quantitative Thought", laboratory: false },
        { code: "PRRQ", name: "Philosophical and Religious Perspectives", laboratory: false },
        { code: "VPRQ", name: "Visual and Performing Arts", laboratory: false },
      ],
      coursesRequired: 7,
      maxSlotsPerCourse: 1,
      preMatriculationMaxCredits: 2,
      mayAlsoFill: ["CULT", "JEC"],
      text:
        "Each student must complete seven courses fulfilling Ways of Knowing Requirements, one course in each of " +
        "the categories below. No single course satisfies more than one Ways of Knowing Requirement. A course " +
        "may satisfy a Ways of Knowing Requirement and the Cultural Diversity requirement or the Justice, " +
        "Equality, and Community requirement. No more than two credits attained prior to matriculation at " +
        "Davidson College (or, for transfer students, a degree candidate at another college) may be applied to " +
        "the satisfaction of Ways of Knowing Requirements.",
      source: from("Requirements for Completion of A.B. and B.S. Degrees: Ways of Knowing"),
    },
    culturalDiversity: {
      code: "CULT",
      slot: "CULT",
      coursesRequired: 1,
      mayOverlapWaysOfKnowing: true,
      text: "Complete a course designated as satisfying the Cultural Diversity (CULT) Requirement.",
      source: from("Requirements for Completion of A.B. and B.S. Degrees: Cultural Diversity"),
    },
    justiceEqualityCommunity: {
      code: "JEC",
      slot: "JEC",
      coursesRequired: 1,
      mayOverlapWaysOfKnowing: true,
      text: "Complete a course designated as satisfying the Justice, Equality, and Community (JEC) Requirement.",
      source: from(
        "Requirements for Completion of A.B. and B.S. Degrees: Justice, Equality, and Community",
      ),
    },
    language: {
      code: "FRLG",
      slot: "FRLG",
      minCourseNumber: 201,
      languages: [
        { subject: "GRE", name: "Ancient Greek" },
        { subject: "ARB", name: "Arabic" },
        { subject: "CHI", name: "Chinese" },
        { subject: "FRE", name: "French" },
        { subject: "GER", name: "German" },
        { subject: "LAT", name: "Latin" },
        { subject: "RUS", name: "Russian" },
        { subject: "SPA", name: "Spanish" },
      ],
      excludedSubjects: [
        {
          subject: "SIL",
          reason:
            "Courses offered through the Self-Instructional Language Program do not satisfy the Language Requirement.",
        },
      ],
      alternatives: [
        "An approved transfer course at equivalent level",
        "Equivalent proficiency as determined and certified by the appropriate Davidson department",
        "Documented multilingualism",
      ],
      recommendedBefore: "entering the senior year",
      text:
        "Complete the Language Requirement by successfully completing the third-semester level (201 or higher) " +
        "of a Davidson College language (Ancient Greek, Arabic, Chinese, French, German, Latin, Russian or " +
        "Spanish), by an approved transfer course at equivalent level, or by equivalent proficiency as determined " +
        "and certified by the appropriate Davidson department. Courses offered through the Self-Instructional " +
        "Language Program do not satisfy the Language Requirement. A student who satisfactorily documents that " +
        "he/she/they are multilingual satisfies the language requirement.",
      source: from("Requirements for Completion of A.B. and B.S. Degrees: Language"),
    },
    physicalEducation: {
      slot: "PE",
      lifetimeActivity: 2,
      teamSport: 1,
      creditBearing: false,
      inCourseApi: false,
      recommendedBy: "the end of the sophomore year (encouraged, not required)",
      text:
        "A total of three non-credit physical education and wellness courses are required: two Lifetime " +
        "Activity credits and one Team Sport credit. Students are encouraged, but not required, to complete the " +
        "physical education and wellness requirement by the end of their sophomore year.",
      source: from(
        "Requirements for Completion of A.B. and B.S. Degrees: Physical Education and Wellness",
      ),
    },
    passFail: {
      maxElected: 3,
      maxPerSemester: 1,
      notCounted: [
        "Courses designated as Pass/Fail by a faculty member or department",
        "Transfer courses (ungraded, not Pass/Fail)",
      ],
      passMinimumGrade: "C-",
      satisfiesMajorMinor: false,
      designationDeadline: "the end of the ninth week of the last semester of the senior year",
      text:
        "A student may elect to take no more than three courses Pass/Fail, with no more than one in any " +
        "semester. Courses designated as Pass/Fail by a faculty member or department do not count towards the " +
        "three-course maximum, nor do transfer courses (which are ungraded, not Pass/Fail). Pass/Fail courses " +
        "may be used to fulfill all requirements except that they do not satisfy requirements in a major, minor, " +
        "or interdisciplinary minor.",
      source: from("Pass/Fail Option"),
    },
    preMatriculation: {
      maxCredits: 4,
      waysOfKnowingMaxCredits: 2,
      text:
        "Entering first-year students may transfer a maximum of four credits from courses taken prior to " +
        "matriculation at Davidson. This includes AP, IB, and dual (high school/college) enrollment credits as " +
        "well as courses taken between high school graduation and matriculation at Davidson. No more than two " +
        "credits attained prior to matriculation at Davidson (or, for transfer students, prior to enrolling as a " +
        "degree candidate at another college) may be applied to the satisfaction of Ways of Knowing " +
        "Requirements.",
      source: from("Transfer Credit"),
    },
    major: {
      minGpa: 2,
      declareBy: "the beginning of the junior year",
      text:
        "Complete all requirements for a major field of study, including an average of 2.0 in the courses " +
        "counted toward the major. All students must officially declare a major through the Office of the " +
        "Registrar by the beginning of the junior year.",
      source: from("Major Field of Study; Majors, Minors, and Interdisciplinary Minors"),
    },
    minor: {
      declareBy: "October 1 of the senior year",
      text:
        "Students are allowed to declare a minor through the Registrar's Office no later than October 1 of the " +
        "senior year.",
      source: from("Majors, Minors, and Interdisciplinary Minors"),
    },
  };
}

export const GRADUATION_RULES: Readonly<Record<string, GraduationRules>> = Object.freeze({
  "2025-2026": defineContentObject(
    "requirements:2025-2026",
    GraduationRulesSchema,
    rulesFrom("2025-2026", "Academic Regulations 2025-2026", REGULATIONS_2025_26),
  ),
  "2026-2027": defineContentObject(
    "requirements:2026-2027",
    GraduationRulesSchema,
    rulesFrom("2026-2027", "Academic Regulations 2026-2027", REGULATIONS_2026_27),
  ),
});

/** Catalog years with verified rules, oldest first. */
export const CATALOG_YEARS: readonly string[] = Object.freeze(Object.keys(GRADUATION_RULES).sort());

/** The current catalog (2026-2027). */
export const CURRENT_CATALOG_YEAR: string = CATALOG_YEARS[CATALOG_YEARS.length - 1] ?? "2026-2027";

/**
 * The catalog year of a term: the academic year it belongs to (202601 Fall 2026, 202602 Spring 2027 and 202603
 * Summer 2027 are all 2026-2027). Null for a malformed code.
 */
export function catalogYearForTerm(termCode: TermCode): string | null {
  const term = parseTermCode(termCode);
  if (!term) return null;
  const start = Number(termCode.slice(0, 4));
  return `${start}-${start + 1}`;
}

/** Verified rules for exactly this catalog year, or null. */
export function graduationRulesFor(catalogYear: string): GraduationRules | null {
  return Object.hasOwn(GRADUATION_RULES, catalogYear)
    ? (GRADUATION_RULES[catalogYear] ?? null)
    : null;
}

/**
 * The rules to apply for a student's catalog year. `exact` is false when that year has no verified edition here
 * (earlier or later than CATALOG_YEARS, or unknown): the nearest verified edition is returned and the tracker
 * should say "rules for <catalogYear> not checked; showing <rules.catalogYear>".
 */
export function resolveGraduationRules(catalogYear: string | null | undefined): {
  rules: GraduationRules;
  exact: boolean;
} {
  const exact = catalogYear ? graduationRulesFor(catalogYear) : null;
  if (exact) return { rules: exact, exact: true };
  const oldest = CATALOG_YEARS[0] ?? CURRENT_CATALOG_YEAR;
  const nearest =
    catalogYear && CatalogYearSchema.safeParse(catalogYear).success && catalogYear < oldest
      ? oldest
      : CURRENT_CATALOG_YEAR;
  const rules = GRADUATION_RULES[nearest];
  if (!rules) throw new Error(`server/content/requirements: no rules for ${nearest}`);
  return { rules, exact: false };
}
