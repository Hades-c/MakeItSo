/**
 * Pasted-syllabus limits shared by the client (the paste form's counter and its own check, before sending) and the
 * server (lib/api/syllabi.ts, the authoritative check). Isomorphic: no zod, safe in client bundles.
 */

/** The most text one paste may hold: about ten pages of a syllabus, the part with the schedule. */
export const MAX_SYLLABUS_CHARS = 20_000;

/** At least this many non-space characters, or there is nothing to read dates from. */
export const MIN_SYLLABUS_CHARS = 40;

/** Deadlines one syllabus may give (the extraction keeps the first this many; the review saves at most this many). */
export const MAX_SYLLABUS_DEADLINES = 50;

/** Characters of `text` that count toward MIN_SYLLABUS_CHARS. */
export function usableChars(text: string): number {
  return text.replace(/\s/g, "").length;
}
