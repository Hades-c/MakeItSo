import * as z from "zod";
import { SOURCE_IDS, SYNCED_SOURCE_IDS } from "@/lib/sources";
import { TERM_CODE_PATTERN } from "@/lib/term";

/**
 * Shared zod primitives for lib/types/** and lib/api/** (PLAN §4.1). Isomorphic: safe in client bundles.
 * Every exported schema has a same-named type (z.infer / z.output) for code that only needs the type.
 */

/** "202602". See lib/term.ts for the calendar rules. */
export const TermCodeSchema = z
  .string()
  .regex(TERM_CODE_PATTERN, "must be a term code such as 202602");
export type TermCodeValue = z.infer<typeof TermCodeSchema>;

/** A catalog course code: department (2–4 capitals), one space, three digits, optional suffix letter: "HIS 357". */
export const COURSE_CODE_PATTERN = /^[A-Z]{2,4} \d{3}[A-Z]?$/;

/**
 * Normalise user or upstream input to the course-code form: upper case, trimmed, one space between department and
 * number ("csc121" / " CSC  121 " → "CSC 121"). Returns the input upper-cased and whitespace-collapsed when it does
 * not look like a course code (so validation can still reject it with a useful message).
 */
export function normalizeCourseCode(input: string): string {
  const compact = input.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");
  const match = /^([A-Z]{2,4}) ?(\d{3}[A-Z]?)$/.exec(compact);
  return match ? `${match[1]} ${match[2]}` : compact;
}

/** Accepts "CSC121", "csc 121", " CSC  121 " and outputs the canonical "CSC 121". */
export const CourseCodeSchema = z
  .string()
  .max(20)
  .transform(normalizeCourseCode)
  .pipe(z.string().regex(COURSE_CODE_PATTERN, "must be a course code such as CSC 221"));
export type CourseCode = z.output<typeof CourseCodeSchema>;

/** Davidson CRN, as a string of digits ("10003"). Upstream sends a number; store and compare strings. */
export const CrnSchema = z.coerce.string().regex(/^\d{4,6}$/, "must be a CRN such as 20083");
export type Crn = z.output<typeof CrnSchema>;

/** "YYYY-MM-DD" calendar date (no time zone: meaning depends on the field's documentation). */
export const IsoDateSchema = z.iso.date();
/** ISO 8601 date-time with an explicit offset or Z ("2026-09-30T14:00:00.000Z"). */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
/** 24-hour wall-clock time in America/New_York: "09:30", "13:40". */
export const ClockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM (24 h)");

/** An https URL (external links are https-only, PLAN §7 "Links"). */
export const HttpsUrlSchema = z.url({ protocol: /^https$/, error: "must be an https URL" });

/** A same-origin app path such as "/courses/202602/CSC-221" (never "//host" or "https://..."). */
export const AppPathSchema = z
  .string()
  .max(2048)
  .regex(/^\/(?!\/)[^\s\\]*$/, "must be an app path starting with /");

/** 24-hex Mongo ObjectId string. */
export const ObjectIdSchema = z.string().regex(/^[a-f0-9]{24}$/, "must be an id");

export const SourceIdSchema = z.enum(SOURCE_IDS);
export const SyncedSourceIdSchema = z.enum(SYNCED_SOURCE_IDS);

/** A URL-safe slug ("software-engineering"). */
export const SlugSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a slug such as software-engineering");

/**
 * Provenance every curated record carries (PLAN §4.1.6, §7 "No hardcoded facts without source + verifiedAt"):
 * ≥1 https source URL and the date a person last checked it.
 */
export const SourcedSchema = z.object({
  sources: z.array(HttpsUrlSchema).min(1),
  verifiedAt: IsoDateSchema,
});

// ---- Query-string helpers --------------------------------------------------------------------------------------
// URLSearchParams values arrive as string | string[] (repeated keys); typed callers pass real values. Every helper
// makes its key optional on input and always present on output (defaults applied).

const QueryValueSchema = z.union([z.string(), z.array(z.string())]).optional();

function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value])
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function firstValue<T>(value: T | T[] | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A repeated or comma-separated query parameter (`?dept=CSC&dept=MAT` or `?dept=CSC,MAT`); default []. */
export function queryList<T extends z.ZodType>(item: T) {
  // Each list entry is a string from the URL; `item` validates (and narrows) it.
  const list = z.array(item) as unknown as z.ZodArray<z.ZodType<z.output<T>, string>>;
  return QueryValueSchema.transform(toList).pipe(list);
}

/** "true" | "1" | "false" | "0" (or a real boolean) with a default. */
export function queryBoolean(defaultValue: boolean) {
  return z
    .union([z.boolean(), z.string(), z.array(z.string())])
    .optional()
    .transform((value, ctx) => {
      const first = firstValue(value);
      if (first === undefined || first === "") return defaultValue;
      if (first === true || first === "true" || first === "1") return true;
      if (first === false || first === "false" || first === "0") return false;
      ctx.addIssue({ code: "custom", message: 'must be "true" or "false"' });
      return z.NEVER;
    });
}

/** An integer query parameter within [min, max] with a default. */
export function queryInt(min: number, max: number, defaultValue: number) {
  return z
    .union([z.number(), z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      const first = firstValue(value);
      return first === undefined || first === "" ? defaultValue : Number(first);
    })
    .pipe(z.number().int().min(min).max(max));
}

/** A free-text query parameter: NFKC, trimmed, inner whitespace collapsed, cut to maxLength; default "". */
export function queryText(maxLength: number) {
  return QueryValueSchema.transform((value) =>
    (firstValue(value) ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, maxLength),
  );
}
