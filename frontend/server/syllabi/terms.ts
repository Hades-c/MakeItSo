import "server-only";
import { currentTermFrom, nextRegularTerm, termLabel, type TermCode } from "@/lib/term";
import { resolveTerms } from "@/server/catalog";
import { now } from "@/server/clock";
import { MissingFixtureError } from "@/server/http/fixtures";

/**
 * The terms a syllabus can be added for: the current term (the default) and the next one, nothing older or later
 * (a syllabus is for a class being taken now or about to start). Each with its first and last day when the
 * Registrar's term list gives them, so the review step can flag a date outside the term.
 */
export interface SyllabusTerm {
  code: TermCode;
  label: string;
  /** First day of classes ("YYYY-MM-DD"), or null (or absent) when the term list has no dates for it. */
  start?: string | null;
  /** Last day of the term ("YYYY-MM-DD"), or null. */
  end?: string | null;
}

/** [current, next]. When the term list cannot be read, the same two terms from the date alone, without days. */
export async function syllabusTerms(): Promise<SyllabusTerm[]> {
  try {
    const resolved = await resolveTerms();
    return [resolved.current, resolved.registration].map((code) => {
      const info = resolved.terms.find((term) => term.code === code);
      return {
        code,
        label: info?.label ?? termLabel(code),
        start: info?.startDate ?? null,
        end: info?.endDate ?? null,
      };
    });
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    console.error("[syllabi] could not read the term list:", error);
    const current = currentTermFrom([], { now: now() });
    return [current, nextRegularTerm(current)].map((code) => ({
      code,
      label: termLabel(code),
      start: null,
      end: null,
    }));
  }
}
