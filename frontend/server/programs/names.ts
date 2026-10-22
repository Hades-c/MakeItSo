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

/** The kind of offering a name asks for: "… minor" means a minor or an interdisciplinary minor. */
export type NameFamily = "major" | "minor" | "concentration";

export const FAMILY_KINDS: Readonly<Record<NameFamily, readonly ProgramOfferingKind[]>> = {
  major: ["major"],
  minor: ["minor", "interdisciplinary-minor"],
  concentration: ["concentration"],
};

export interface NameQuery {
  /** programKey of the whole input. */
  key: string;
  /** programKey of its subject: "Major in Economics (A.B. Degree)", "Economics (minor)" → "economics". */
  subject: string;
  /** The kind the input names ("Physics minor" → minor), null when it names none. */
  family: NameFamily | null;
  /** The input names more than one kind ("Economics major and minor"). */
  conflicting: boolean;
}

// On programKey form (lower case, punctuation as spaces, "and" dropped): "b s" = B.S., "a b" = A.B.
const DEGREE = String.raw`(?:a b|b a|b s|ab|ba|bs)`;
const DEGREE_AT_END = new RegExp(
  String.raw`(?:^| )(?:${DEGREE}(?: or ${DEGREE})*(?: degree)?|degree)$`,
);
const DEGREE_AT_START = new RegExp(String.raw`^${DEGREE}(?: degree)?(?: (?:in|of))?(?: |$)`);
const KIND_AT_START =
  /^(?:interdisciplinary )?(?:majors?|minors?|concentrations?|program)(?: (?:in|of))?(?: |$)/;
const KIND_AT_END =
  /(?:^| )(?:interdisciplinary )?(?:majors?|minors?|concentrations?)(?: requirements?)?$/;

/**
 * Read a free-text program name: its subject and the kind it names, tolerant of punctuation around the kind and
 * degree words ("Economics (minor)", "Minor: Economics", "Major - Computer Science", "Computer Science, B.S.",
 * "B.S. in Computer Science", "Environmental Studies (B.A.)").
 */
export function parseNameQuery(input: string): NameQuery {
  const key = programKey(input);
  const families: NameFamily[] = [];
  if (/\bmajors?\b/.test(key)) families.push("major");
  if (/\bminors?\b/.test(key)) families.push("minor");
  if (/\bconcentrations?\b/.test(key)) families.push("concentration");
  let subject = key;
  for (let previous = ""; previous !== subject;) {
    previous = subject;
    subject = subject
      .replace(DEGREE_AT_END, "")
      .replace(KIND_AT_END, "")
      .replace(KIND_AT_START, "")
      .replace(DEGREE_AT_START, "")
      .trim();
  }
  return {
    key,
    subject,
    family: families.length === 1 ? (families[0] ?? null) : null,
    conflicting: families.length > 1,
  };
}

/** The subject key of an offering name or free text ("Major in Economics (A.B. Degree)" → "economics"). */
export function subjectKey(name: string): string {
  return parseNameQuery(name).subject;
}

export interface NamedOffering {
  kind: ProgramOfferingKind;
  name: string;
}

export interface NamedProgram<O extends NamedOffering = NamedOffering> {
  name: string;
  offerings: readonly O[];
}

/** Without a kind in the text, majors first ("Economics" is the Economics major). */
const DEFAULT_ORDER: readonly ProgramOfferingKind[] = [
  "major",
  "interdisciplinary-minor",
  "minor",
  "concentration",
  "other",
];

/**
 * Resolve free text to one offering (pure core of findProgramByName):
 *   1. the official name itself (any spelling of "&"/"and", punctuation, case);
 *   2. the subject ("Economics", "Economics minor", "Computer Science (B.S.)");
 *   3. the department page's name ("Genomics & Bioinformatics minor") when that page has exactly one offering.
 * A kind named in the text is a constraint, not a preference: "Physics minor" never resolves to the Physics major,
 * and neither does "Minor in Economics" when only majors are allowed (`kinds`). Ambiguous text (two offerings of
 * the same kind, e.g. "Classics" or "Physics minor"; or two kinds, "Economics major and minor") resolves to null,
 * never a guess.
 */
export function matchProgramName<P extends NamedProgram>(
  programs: readonly P[],
  input: string,
  kinds?: readonly ProgramOfferingKind[],
): { program: P; offering: P["offerings"][number] } | null {
  const query = parseNameQuery(input);
  if (!query.key || query.conflicting) return null;
  const allowed = new Set<ProgramOfferingKind>(kinds && kinds.length > 0 ? kinds : DEFAULT_ORDER);
  const order = (query.family ? FAMILY_KINDS[query.family] : DEFAULT_ORDER).filter((kind) =>
    allowed.has(kind),
  );
  if (order.length === 0) return null;
  const candidates = programs.flatMap((program) =>
    program.offerings
      .filter((offering) => order.includes(offering.kind))
      .map((offering) => ({ program, offering })),
  );

  const exact = candidates.find(({ offering }) => programKey(offering.name) === query.key);
  if (exact) return exact;

  const pick = (list: typeof candidates) => {
    for (const kind of order) {
      const ofKind = list.filter(({ offering }) => offering.kind === kind);
      if (ofKind.length === 1) return ofKind[0] ?? null;
      if (ofKind.length > 1) return null;
    }
    return null;
  };

  if (!query.subject) return null;
  const bySubject = candidates.filter(
    ({ offering }) => subjectKey(offering.name) === query.subject,
  );
  if (bySubject.length > 0) return pick(bySubject);

  const byPage = candidates.filter(({ program }) => programKey(program.name) === query.subject);
  if (byPage.length > 0) return pick(byPage);
  return null;
}
