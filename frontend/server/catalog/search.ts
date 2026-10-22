import "server-only";
import type { CatalogQuery, CourseSummary, Section } from "@/lib/types/catalog";
import { registrableSeats, type SectionLookup } from "@/server/catalog/courses";
import { cleanQuery, foldForSearch } from "@/server/catalog/normalize";
import type { IndexedCourse, TermIndex } from "@/server/catalog/store";

/**
 * Catalog search over a term index (PLAN §6.1 W1; CatalogQuerySchema semantics). Pure and synchronous: a full
 * term is a few hundred courses in memory, so a query is well under a millisecond.
 *
 * Text (`q`; NFKC, invisible characters removed, whitespace collapsed; empty = no filter):
 * - course codes in any spelling ("CSC121", "csc 121", "CSC-121", "CSC.121", "csc_121"), with or without a
 *   section ("CSC121A", "CSC 121 A", "CHE 430-A" → the course; a lettered number such as "MUS 101L" wins when the
 *   term has one) → that course; when no listing has the code, the courses cross-listed or registrable under it.
 *   Several codes ("CSC 121, MAT 110", "CSC121 or CSC221") → any of them;
 * - a partial code ("CSC 2", "csc22") → codes starting with it;
 * - a department code of the term, a course subject or a cross-posting ("CSC", "eco", "FMD") → that department's
 *   courses, plus courses where the word stands on its own in titles, instructor names or descriptions ("Dan" →
 *   DAN courses and courses taught by a Dan);
 * - anything else → every word must occur (accent-, case- and apostrophe-insensitive substring: "O’Geen" =
 *   "O'Geen" = "ogeen") in the course's codes, course and section titles, instructor names (all sections) or
 *   descriptions. Hyphens, slashes, commas and brackets separate words ("problem-solving"); code-like words
 *   ("csc121") match as codes.
 * Filters: dept / req / days / after / before / openOnly / level (OR inside a list, AND across filters). Section
 * filters (req, days, times, openOnly) must hold together for at least one section. openOnly counts the seats a
 * max-0 cross-listed listing registers through (its CRN-matched siblings). Results are sorted by code.
 */

export type TextQuery =
  | { kind: "none" }
  | { kind: "codes"; codes: string[] }
  | { kind: "prefix"; prefix: string }
  | { kind: "dept"; subject: string; word: string }
  | { kind: "words"; words: string[] };

/** What the parser needs to know about the term. */
export type QueryContext = Pick<TermIndex, "subjects" | "aliasCodes">;

/**
 * A course code inside a query (upper-cased): subject, number and an optional section letter (single or doubled,
 * as Davidson names sections: "A", "AA"), with any of " ._,/-" between subject and number.
 */
const CODE_TOKEN = /(?<![A-Z0-9])([A-Z]{2,4})[ ._,/-]?(\d{3})(?:([ -]?)([A-Z])(\4)?)?(?![A-Z0-9])/g;
/** What may separate several codes: spaces, punctuation, "and", "or". */
const CODE_SEPARATORS = /\b(?:AND|OR)\b|[\s,;/&+|]+/g;
const PARTIAL_CODE = /^([A-Za-z]{2,4}) ?(\d{1,2})$/;
const DEPT_CODE = /^[A-Za-z]{2,4}$/;
/** Characters that separate query words (apostrophes are dropped by foldForSearch, periods kept: "U.S."). */
const WORD_SEPARATORS = /[\s\-_/,;:()[\]{}"!?]+/;

interface CodeMatch {
  code: string;
  start: number;
  end: number;
}

function findCodes(upper: string, context: QueryContext): CodeMatch[] {
  const found: CodeMatch[] = [];
  for (const match of upper.matchAll(CODE_TOKEN)) {
    const [whole, subject, number, separator, letter, doubled] = match;
    const base = `${subject} ${number}`;
    // "CSC121A" is a lettered course number only if the term has one; otherwise course CSC 121, section A.
    const lettered = letter && !separator && !doubled ? `${base}${letter}` : null;
    const code = lettered && context.aliasCodes.has(lettered) ? lettered : base;
    found.push({ code, start: match.index, end: match.index + whole.length });
  }
  return found;
}

function withoutMatches(text: string, matches: readonly CodeMatch[]): string {
  let out = "";
  let at = 0;
  for (const match of matches) {
    out += `${text.slice(at, match.start)} `;
    at = match.end;
  }
  return out + text.slice(at);
}

/** Query words (folded, split on WORD_SEPARATORS, stray periods trimmed). */
function queryWords(text: string): string[] {
  return foldForSearch(text)
    .split(WORD_SEPARATORS)
    .map((word) => word.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

export function prepareTextQuery(q: string, context: QueryContext): TextQuery {
  const text = cleanQuery(q);
  if (!text) return { kind: "none" };
  const upper = text.toUpperCase();
  const codes = findCodes(upper, context);
  const rest = withoutMatches(upper, codes);
  if (codes.length > 0 && rest.replace(CODE_SEPARATORS, "") === "") {
    return { kind: "codes", codes: [...new Set(codes.map((match) => match.code))] };
  }
  const partial = PARTIAL_CODE.exec(text.replace(/[._,/-]+/g, " ").trim());
  if (partial?.[1] && partial[2]) {
    return { kind: "prefix", prefix: `${partial[1].toUpperCase()} ${partial[2]}` };
  }
  if (DEPT_CODE.test(text) && context.subjects.has(upper)) {
    return { kind: "dept", subject: upper, word: foldForSearch(text) };
  }
  const words = [
    ...new Set([...codes.map((match) => foldForSearch(match.code)), ...queryWords(rest)]),
  ];
  return words.length > 0 ? { kind: "words", words } : { kind: "none" };
}

/** A parsed query, ready to test many courses. */
interface CompiledQuery {
  text: TextQuery;
  /** codes kind: the codes some listing of the term has as its own code (else they match as aliases). */
  ownCodes: ReadonlySet<string>;
  /** dept kind: the word on its own ("dan" in "Dan Aldridge", not in "Jordan"). */
  wordPattern: RegExp | null;
}

function compile(index: TermIndex, q: string): CompiledQuery {
  const text = prepareTextQuery(q, index);
  return {
    text,
    ownCodes: new Set(text.kind === "codes" ? text.codes.filter((c) => index.byCode.has(c)) : []),
    // Dept words are 2–4 letters (DEPT_CODE), so they are safe inside a pattern.
    wordPattern: text.kind === "dept" ? new RegExp(`\\b${text.word}\\b`) : null,
  };
}

/** Text match; `blob` picks the long (with descriptions) or the short (⌘K palette) haystack. */
function matchesText(
  course: IndexedCourse,
  query: CompiledQuery,
  blob: "haystack" | "shortHaystack",
): boolean {
  const { text } = query;
  switch (text.kind) {
    case "none":
      return true;
    case "codes":
      return text.codes.some((code) =>
        query.ownCodes.has(code) ? course.code === code : course.aliases.has(code),
      );
    case "prefix":
      return [...course.aliases].some((alias) => alias.startsWith(text.prefix));
    case "dept":
      return (
        course.subject === text.subject ||
        course.crossPostings.has(text.subject) ||
        (query.wordPattern?.test(course[blob]) ?? false)
      );
    case "words":
      return text.words.every((word) => course[blob].includes(word));
  }
}

type SectionFilters = Pick<CatalogQuery, "req" | "days" | "after" | "before" | "openOnly">;

/**
 * A section passes every section-level filter. TBA meetings never rule a section out. `lookup` (the term's
 * sections by CRN) lets a max-0 cross-listed listing count its siblings' seats for openOnly.
 */
export function sectionMatches(
  section: Section,
  filters: SectionFilters,
  lookup?: SectionLookup,
): boolean {
  if (filters.req.length > 0 && !section.reqCodes?.some((code) => filters.req.includes(code))) {
    return false;
  }
  if (filters.openOnly && registrableSeats(section, lookup) <= 0) return false;
  const timed = section.meetings.filter((meeting) => !meeting.tba);
  if (filters.days.length > 0) {
    const free = new Set(filters.days);
    if (!timed.every((meeting) => meeting.days.every((day) => free.has(day)))) return false;
  }
  const { after, before } = filters;
  if (after && !timed.every((meeting) => meeting.start !== null && meeting.start >= after)) {
    return false;
  }
  if (before && !timed.every((meeting) => meeting.end !== null && meeting.end <= before)) {
    return false;
  }
  return true;
}

function hasSectionFilters(filters: SectionFilters): boolean {
  return (
    filters.req.length > 0 ||
    filters.days.length > 0 ||
    filters.openOnly ||
    filters.after !== undefined ||
    filters.before !== undefined
  );
}

export interface SearchPage {
  items: CourseSummary[];
  total: number;
}

/** Every course of the index matching the query, sorted by code. */
export function matchCourses(index: TermIndex, query: CatalogQuery): IndexedCourse[] {
  const compiled = compile(index, query.q);
  const depts = new Set(query.dept);
  const levels = new Set(query.level);
  const sectionFiltered = hasSectionFilters(query);
  const lookup = (crn: string) => index.byCrn.get(crn);
  return index.courses.filter((course) => {
    if (depts.size > 0) {
      const inDept =
        depts.has(course.subject) || [...course.crossPostings].some((code) => depts.has(code));
      if (!inDept) return false;
    }
    if (levels.size > 0 && (!course.level || !levels.has(course.level))) return false;
    if (!matchesText(course, compiled, "haystack")) return false;
    return !sectionFiltered || course.course.sections.some((s) => sectionMatches(s, query, lookup));
  });
}

export function searchIndex(index: TermIndex, query: CatalogQuery): SearchPage {
  const matches = matchCourses(index, query);
  const start = (query.page - 1) * query.pageSize;
  return {
    items: matches.slice(start, start + query.pageSize).map((course) => course.summary),
    total: matches.length,
  };
}

/**
 * The ⌘K palette's course matches: precise rather than exhaustive (codes, titles, instructors; no
 * descriptions), best first: exact code, alias code, code prefix, the department's own courses, its
 * cross-postings, the department word elsewhere (an instructor named Dan), title words, other words.
 */
export function paletteMatches(index: TermIndex, q: string, limit: number): IndexedCourse[] {
  const compiled = compile(index, q);
  const { text } = compiled;
  if (text.kind === "none" || limit < 1) return [];
  const scored: { course: IndexedCourse; score: number }[] = [];
  for (const course of index.courses) {
    let score = 0;
    switch (text.kind) {
      case "codes":
        if (text.codes.includes(course.code)) score = 100;
        else if (matchesText(course, compiled, "shortHaystack")) score = 90;
        break;
      case "prefix":
        score = matchesText(course, compiled, "shortHaystack") ? 80 : 0;
        break;
      case "dept":
        if (course.subject === text.subject) score = 60;
        else if (course.crossPostings.has(text.subject)) score = 50;
        else if (matchesText(course, compiled, "shortHaystack")) score = 40;
        break;
      case "words":
        if (text.words.every((word) => course.shortHaystack.includes(word))) {
          score = text.words.every((word) => course.foldedTitle.includes(word)) ? 30 : 20;
          if (text.words[0] && course.foldedTitle.startsWith(text.words[0])) score += 5;
        }
        break;
    }
    if (score > 0) scored.push({ course, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || (a.course.code < b.course.code ? -1 : 1))
    .slice(0, limit)
    .map((row) => row.course);
}

/**
 * For a topics course (neutral course title), the section title every query word points at ("religion public" →
 * "Religion in the Public Square"), so the palette can say which topic matched; null otherwise.
 */
export function matchedSectionTitle(course: IndexedCourse, q: string): string | null {
  if (!course.topics) return null;
  const words = queryWords(cleanQuery(q));
  if (words.length === 0) return null;
  return (
    course.sectionTitles.find(({ folded }) => words.every((word) => folded.includes(word)))
      ?.title ?? null
  );
}
