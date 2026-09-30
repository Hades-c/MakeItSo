import "server-only";
import type { ProgramOfferingKind } from "@/lib/types/catalog";

/**
 * Program-name normalisation shared by the parser (dedupe across department pages) and findProgramByName
 * (legacy profile strings, AI output, user input). Pure.
 */

/**
 * A comparison key: accents removed, lower case, "&" and "and" dropped, punctuation and repeated spaces folded.
 * "French & Francophone Studies", "French and Francophone Studies" and "french, francophone studies" share
 * the key "french francophone studies".
 */
export function programKey(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token !== "" && token !== "and")
    .join(" ");
}

/** Display label of an offering kind, as it starts an official name ("Interdisciplinary Minor in …"). */
export const KIND_LABELS: Readonly<Record<ProgramOfferingKind, string>> = {
  major: "Major",
  minor: "Minor",
  "interdisciplinary-minor": "Interdisciplinary Minor",
  concentration: "Concentration",
  other: "Program",
};

/**
 * The official offering name: "<Label> in <Subject>" plus " (<Degree> Degree)" for majors that name a degree,
 * e.g. "Major in Computer Science (B.S. Degree)", "Minor in Economics", "Interdisciplinary Minor in Data Science",
 * "Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)".
 */
export function offeringName(label: string, subject: string, degree: string | null): string {
  return `${label} in ${subject}${degree ? ` (${degree} Degree)` : ""}`;
}

const NAME_PREFIX =
  /^\s*(?:(?:interdisciplinary\s+)?(?:major|minor)|concentration|program)\s+(?:in|of)\s+/i;
const DEGREE_SUFFIX = /\s*\([^()]*\bdegree\b[^()]*\)\s*$/i;
const KIND_SUFFIX = /\s+(?:interdisciplinary\s+)?(?:major|minor)(?:\s+requirements?)?\s*$/i;

/**
 * The subject of an offering name or free text: "Major in Economics (A.B. Degree)" → "Economics",
 * "Computer Science Major" → "Computer Science", "Economics" → "Economics".
 */
export function subjectOf(name: string): string {
  const withoutDegree = name.replace(DEGREE_SUFFIX, "");
  const withoutPrefix = withoutDegree.replace(NAME_PREFIX, "");
  if (withoutPrefix !== withoutDegree) return withoutPrefix.trim();
  return withoutDegree.replace(KIND_SUFFIX, "").trim();
}

/** Which kinds a free-text name asks for ("… minor" → minors first), else majors first. */
export function kindPreference(input: string): ProgramOfferingKind[] {
  if (/\bminor\b/i.test(input)) {
    return ["minor", "interdisciplinary-minor", "major", "concentration", "other"];
  }
  if (/\bconcentration\b/i.test(input)) {
    return ["concentration", "major", "minor", "interdisciplinary-minor", "other"];
  }
  return ["major", "interdisciplinary-minor", "minor", "concentration", "other"];
}

export interface NamedOffering {
  kind: ProgramOfferingKind;
  name: string;
}

export interface NamedProgram<O extends NamedOffering = NamedOffering> {
  name: string;
  offerings: readonly O[];
}

/**
 * Resolve free text to one offering (pure core of findProgramByName):
 *   1. the official name itself (any spelling of "&"/"and", punctuation, case);
 *   2. the subject ("Economics", "Economics minor"), preferring the kind the text names, majors otherwise;
 *   3. the department page's name ("Genomics & Bioinformatics") when that page has exactly one offering of the
 *      preferred kind.
 * Ambiguous text (two majors with the same subject or page, e.g. "Classics") resolves to null, never a guess.
 */
export function matchProgramName<P extends NamedProgram>(
  programs: readonly P[],
  input: string,
  kinds?: readonly ProgramOfferingKind[],
): { program: P; offering: P["offerings"][number] } | null {
  const key = programKey(input);
  if (!key) return null;
  const allowed = kinds && kinds.length > 0 ? new Set(kinds) : null;
  const all = programs.flatMap((program) =>
    program.offerings
      .filter((offering) => !allowed || allowed.has(offering.kind))
      .map((offering) => ({ program, offering })),
  );

  const exact = all.find(({ offering }) => programKey(offering.name) === key);
  if (exact) return exact;

  const order = kindPreference(input);
  const pick = (candidates: typeof all) => {
    for (const kind of order) {
      const ofKind = candidates.filter(({ offering }) => offering.kind === kind);
      if (ofKind.length === 1) return ofKind[0] ?? null;
      if (ofKind.length > 1) return null;
    }
    return null;
  };

  const subject = programKey(subjectOf(input));
  if (!subject) return null;
  const bySubject = all.filter(({ offering }) => programKey(subjectOf(offering.name)) === subject);
  if (bySubject.length > 0) return pick(bySubject);

  const byPage = all.filter(({ program }) => programKey(program.name) === subject);
  if (byPage.length > 0) return pick(byPage);
  return null;
}
