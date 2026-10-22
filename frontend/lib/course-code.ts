/**
 * Course-code text rules without zod (lib/types/common.ts builds CourseCodeSchema from them and re-exports them).
 * lib/routes.ts and client islands import them from here: a module that builds zod schemas keeps all of zod in
 * every page that imports anything from it, schemas unused or not.
 */

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

/**
 * Canonical code among cross-listed siblings (PLAN §5 "Plan items"): the alphabetically first of the listing's own
 * code and its sibling codes, so every sibling maps to the same key ("BIO 331" + ["PSY 303"] → "BIO 331").
 * Takes sibling codes or a section's `crossListings` objects.
 */
export function canonicalCourseCode(
  code: string,
  crossListings: readonly (string | { readonly courseCode: string })[] = [],
): string {
  const siblings = crossListings.map((listing) =>
    typeof listing === "string" ? listing : listing.courseCode,
  );
  return [code, ...siblings].sort()[0] ?? code;
}
