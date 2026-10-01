import "server-only";
import { normalizeCourseCode } from "@/lib/types/common";
import type { SentenceFilter } from "@/server/ai/sanitize";

/**
 * Grounding of model free text (PLAN §5 "AI grounding & validation", §5 "Sources"): the structured fields of an
 * answer (course codes, terms, majors and minors) are checked against the server's data in grounding.ts and
 * career-plan.ts; these filters do the same for the sentences around them. Each is a SentenceFilter (true = drop
 * the sentence or list item), combined with the forbidden-claims filter of sanitize.ts by the features:
 *
 *   unknownCourses   a course code that is not a candidate (or a cross-listed sibling) or in the student's plan
 *   anyCourseCode    any course code at all (course "About": the only codes it could name are prerequisites)
 *   deadlines        "apply by", deadlines, due dates, month + day and numeric dates: no "Apply by" dates unless
 *                    from a sourced curated entry, and the model is never given one
 *   unknownPrograms  "Major/Minor in X" or "X major/minor" where X is not an official Acalog subject of that kind
 *   properNouns      names of organisations, programs or people that appear nowhere in the data the model was
 *                    given (employers, internship programs): acronyms and runs of capitalised words always, and
 *                    in strict mode (experiences) every capitalised word
 *
 * These are heuristics on top of the prompt rules, tuned to drop too much rather than too little: a dropped
 * sentence costs a shorter answer (or the server-written fallback reason), a kept one could send a student after
 * a program or deadline that does not exist.
 */

/** A course code as a model may write it in free text ("CSC 221", "CSC221", "ECO-101"). */
const COURSE_CODE_IN_TEXT = /\b([A-Z]{2,4})[\s-]?(\d{3}[A-Z]?)\b/g;

/** The course codes a text names, normalised ("CSC 221"). */
export function courseCodesIn(text: string): string[] {
  return [...text.matchAll(COURSE_CODE_IN_TEXT)].map((m) =>
    normalizeCourseCode(`${m[1] ?? ""} ${m[2] ?? ""}`),
  );
}

/** Drop text naming a course outside `allowed` (normalised codes). */
export function unknownCourses(allowed: ReadonlySet<string>): SentenceFilter {
  return (text) => courseCodesIn(text).some((code) => !allowed.has(code));
}

/** Drop text naming any course. */
export const anyCourseCode: SentenceFilter = (text) => courseCodesIn(text).length > 0;

const MONTH =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const DEADLINE_PATTERN = new RegExp(
  [
    String.raw`\b(?:apply|register|sign\s+up|submit)\s+(?:by|before|no\s+later\s+than)\b`,
    String.raw`\bdeadlines?\b`,
    String.raw`\bdue\s+(?:by|on|date)\b`,
    String.raw`\bapplications?\s+(?:open|close|are\s+due)\b`,
    String.raw`\bpriority\s+date\b`,
    String.raw`\b(?:${MONTH})\.?\s+\d{1,2}(?:st|nd|rd|th)?\b`,
    String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:${MONTH})\b`,
    String.raw`\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b`,
  ].join("|"),
  "i",
);

/** Drop deadlines and dates. */
export const deadlines: SentenceFilter = (text) => DEADLINE_PATTERN.test(text);

// ---- Programs ------------------------------------------------------------------------------------------------------

function subjectKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[,.'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)" → "environmental studies". */
export function programSubject(officialName: string): string {
  return subjectKey(
    officialName
      .replace(/^(?:interdisciplinary\s+)?(?:major|minor)\s+in\s+/i, "")
      .replace(/\s*\([^)]*\)\s*$/, ""),
  );
}

export interface ProgramSubjects {
  major: ReadonlySet<string>;
  minor: ReadonlySet<string>;
}

export function programSubjects(names: {
  majors: readonly string[];
  minors: readonly string[];
}): ProgramSubjects {
  return {
    major: new Set(names.majors.map(programSubject)),
    minor: new Set(names.minors.map(programSubject)),
  };
}

const CAPITALISED = String.raw`\p{Lu}[\p{L}'’.-]*`;
const RUN = String.raw`${CAPITALISED}(?:,?\s+(?:and|of|&|the|${CAPITALISED}))*`;
/** "major in X", "Minor in X", "majors in the X". */
const PROGRAM_AFTER = new RegExp(String.raw`\b[Mm](aj|in)ors?\s+in\s+(?:the\s+)?(${RUN})`, "gu");
/** "X major", "an X minor". */
const PROGRAM_BEFORE = new RegExp(String.raw`(${RUN})\s+[Mm](aj|in)ors?\b`, "gu");

function wordsOf(run: string): string[] {
  return subjectKey(run).split(" ").filter(Boolean);
}

/** True when some prefix (after) or suffix (before) of the run's words is an official subject. */
function namesSubject(run: string, subjects: ReadonlySet<string>, from: "start" | "end"): boolean {
  const words = wordsOf(run);
  for (let size = words.length; size >= 1; size--) {
    const part = from === "start" ? words.slice(0, size) : words.slice(words.length - size);
    if (subjects.has(part.join(" "))) return true;
  }
  return false;
}

/** Drop text naming a major or minor that is not official (checked against the subject of that kind). */
export function unknownPrograms(subjects: ProgramSubjects): SentenceFilter {
  return (text) => {
    for (const match of text.matchAll(PROGRAM_AFTER)) {
      const kind = match[1] === "aj" ? subjects.major : subjects.minor;
      if (!namesSubject(match[2] ?? "", kind, "start")) return true;
    }
    for (const match of text.matchAll(PROGRAM_BEFORE)) {
      const kind = match[2] === "aj" ? subjects.major : subjects.minor;
      if (!namesSubject(match[1] ?? "", kind, "end")) return true;
    }
    return false;
  };
}

// ---- Proper nouns ------------------------------------------------------------------------------------------------

/** Words that may start an experience title or sentence without appearing in the data. */
const COMMON_WORDS = [
  "a",
  "an",
  "the",
  "your",
  "you",
  "i",
  "this",
  "that",
  "these",
  "each",
  "every",
  "one",
  "two",
  "some",
  "any",
  "if",
  "when",
  "while",
  "after",
  "before",
  "during",
  "by",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "to",
  "and",
  "or",
  "as",
  "also",
  "then",
  "start",
  "begin",
  "join",
  "visit",
  "talk",
  "meet",
  "attend",
  "apply",
  "look",
  "ask",
  "use",
  "try",
  "take",
  "build",
  "explore",
  "lead",
  "serve",
  "complete",
  "conduct",
  "participate",
  "present",
  "network",
  "schedule",
  "seek",
  "pursue",
  "find",
  "get",
  "develop",
  "practice",
  "compete",
  "write",
  "teach",
  "tutor",
  "mentor",
  "assist",
  "help",
  "work",
  "study",
  "shadow",
  "volunteer",
  "intern",
  "internship",
  "internships",
  "research",
  "summer",
  "fall",
  "spring",
  "winter",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "first",
  "second",
  "third",
  "fourth",
  "next",
  "early",
  "late",
  "senior",
  "junior",
  "sophomore",
  "first-year",
  "freshman",
  "year",
  "semester",
  "term",
  "campus",
  "on-campus",
  "off-campus",
  "independent",
  "honors",
  "thesis",
  "informational",
  "interview",
  "interviews",
  "alumni",
  "faculty",
  "peer",
  "student",
  "students",
  "club",
  "clubs",
  "organization",
  "organizations",
  "project",
  "projects",
  "hackathon",
  "hackathons",
  "case",
  "competition",
  "competitions",
  "externship",
  "job",
  "part-time",
  "fellowship",
  "conference",
  "workshop",
  "workshops",
  "course",
  "courses",
  "lab",
  "laboratory",
  "community",
  "local",
  "public",
  "academic",
  "professional",
  "leadership",
  "teaching",
  "technical",
  "coding",
  "programming",
  "writing",
  "speaking",
  "networking",
  "mock",
  "office",
  "hours",
  "advising",
  "advisor",
  "advisors",
  "meetings",
  "portfolio",
  "resume",
  "career",
  "careers",
  "learn",
  "gain",
  "consider",
  "focus",
  "plan",
  "prepare",
  "strengthen",
  "combine",
  "add",
  "keep",
  "choose",
  "declare",
  "pair",
  "balance",
  "deepen",
  "broaden",
  "reach",
  "connect",
  "sharpen",
  "explain",
  "show",
  "share",
  "these",
  "together",
  "many",
  "most",
  "people",
  "employers",
  "davidson",
  "college",
  "makeitso",
];
const COMMON = new Set(COMMON_WORDS);

/** Lower-case words (possessives stripped) of texts: the vocabulary proper nouns must come from. */
export function vocabularyOf(texts: readonly string[]): Set<string> {
  const vocabulary = new Set<string>(COMMON_WORDS);
  for (const text of texts) {
    for (const token of tokens(text)) vocabulary.add(lowerWord(token));
  }
  return vocabulary;
}

function tokens(text: string): string[] {
  return text
    .split(/[\s/–—]+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}

function lowerWord(token: string): string {
  return token.replace(/['’]s$/u, "").toLowerCase();
}

const isCapitalised = (token: string) => /^\p{Lu}/u.test(token);
const isAcronym = (token: string) => /^\p{Lu}{2,}s?$/u.test(token);

/**
 * Drop text (one sentence or list item) with a proper noun the vocabulary does not know: an unknown acronym, an
 * unknown capitalised word next to another capitalised word ("Goldman Sachs", "at Jane Street"; the first word
 * of the sentence counts as a neighbour unless it is a common word), and in strict mode any unknown capitalised
 * word, the first one included ("Google internship").
 */
export function properNouns(
  vocabulary: ReadonlySet<string>,
  { strict }: { strict: boolean },
): SentenceFilter {
  return (text) => {
    const list = tokens(text);
    const known = (token: string) => vocabulary.has(lowerWord(token));
    const capitalisedNeighbour = (index: number) => {
      const token = list[index];
      if (token === undefined || !isCapitalised(token)) return false;
      return index > 0 || !COMMON.has(lowerWord(token));
    };
    for (let i = 0; i < list.length; i++) {
      const token = list[i]!;
      if (!isCapitalised(token) || known(token)) continue;
      if (strict || isAcronym(token)) return true;
      if (capitalisedNeighbour(i - 1) || capitalisedNeighbour(i + 1)) return true;
    }
    return false;
  };
}
