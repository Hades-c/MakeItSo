import "server-only";
import type { CatalogQuery, CourseSummary, Section } from "@/lib/types/catalog";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/types/common";
import { foldForSearch } from "@/server/catalog/normalize";
import type { IndexedCourse, TermIndex } from "@/server/catalog/store";

/**
 * Catalog search over a term index (PLAN §6.1 W1; CatalogQuerySchema semantics). Pure and synchronous: a full
 * term is a few hundred courses in memory, so a query is well under a millisecond.
 *
 * Text (`q`, already NFKC-normalised, trimmed and whitespace-collapsed by CatalogQuerySchema; empty = no filter):
 * - a course code in any spelling ("CSC121", "csc 121", "CSC-121") → that course; when no listing has that code,
 *   the courses cross-listed or registrable under it;
 * - a partial code ("CSC 2", "csc22") → codes starting with it;
 * - a department code that exists in the term ("CSC", "eco") → that department's courses (subject or cross-posting)
 *   and courses whose titles contain the word;
 * - anything else → every word must occur (accent- and case-insensitive substring) in the course's codes, course
 *   and section titles, instructor names (all sections) or descriptions; code-like words ("csc121") match as codes.
 * Filters: dept / req / days / after / before / openOnly / level (OR inside a list, AND across filters). Section
 * filters (req, days, times, openOnly) must hold together for at least one section. Results are sorted by code.
 */

export type TextQuery =
  | { kind: "none" }
  | { kind: "code"; code: string }
  | { kind: "prefix"; prefix: string }
  | { kind: "dept"; subject: string; word: string }
  | { kind: "words"; words: string[] };

const PARTIAL_CODE = /^([A-Za-z]{2,4})[\s-]?(\d{1,2})$/;
const DEPT_CODE = /^[A-Za-z]{2,4}$/;
const CODE_IN_TEXT = /\b([a-z]{2,4})[\s-]?(\d{3}[a-z]?)\b/g;

export function prepareTextQuery(q: string, subjects: ReadonlySet<string>): TextQuery {
  const text = q.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!text) return { kind: "none" };
  const code = normalizeCourseCode(text.replace(/-/g, " "));
  if (COURSE_CODE_PATTERN.test(code)) return { kind: "code", code };
  const partial = PARTIAL_CODE.exec(text);
  if (partial?.[1] && partial[2]) {
    return { kind: "prefix", prefix: `${partial[1].toUpperCase()} ${partial[2]}` };
  }
  if (DEPT_CODE.test(text) && subjects.has(text.toUpperCase())) {
    return { kind: "dept", subject: text.toUpperCase(), word: foldForSearch(text) };
  }
  const folded = foldForSearch(text);
  const words: string[] = [];
  const rest = folded.replace(CODE_IN_TEXT, (_match, subject: string, number: string) => {
    words.push(`${subject} ${number}`);
    return " ";
  });
  words.push(...rest.split(" ").filter(Boolean));
  return words.length > 0 ? { kind: "words", words } : { kind: "none" };
}

function matchesText(course: IndexedCourse, query: TextQuery, exactCodeFound: boolean): boolean {
  switch (query.kind) {
    case "none":
      return true;
    case "code":
      return exactCodeFound ? course.code === query.code : course.aliases.has(query.code);
    case "prefix":
      return [...course.aliases].some((alias) => alias.startsWith(query.prefix));
    case "dept":
      return (
        course.subject === query.subject ||
        course.crossPostings.has(query.subject) ||
        new RegExp(`\\b${query.word}\\b`).test(course.foldedTitle)
      );
    case "words":
      return query.words.every((word) => course.haystack.includes(word));
  }
}

type SectionFilters = Pick<CatalogQuery, "req" | "days" | "after" | "before" | "openOnly">;

/** A section passes every section-level filter. TBA meetings never rule a section out. */
export function sectionMatches(section: Section, filters: SectionFilters): boolean {
  if (filters.req.length > 0 && !section.reqCodes?.some((code) => filters.req.includes(code))) {
    return false;
  }
  if (filters.openOnly && section.enrollment.remaining <= 0) return false;
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
  const text = prepareTextQuery(query.q, index.subjects);
  const exactCodeFound = text.kind === "code" && index.byCode.has(text.code);
  const depts = new Set(query.dept);
  const levels = new Set(query.level);
  const sectionFiltered = hasSectionFilters(query);
  return index.courses.filter((course) => {
    if (depts.size > 0) {
      const inDept =
        depts.has(course.subject) || [...course.crossPostings].some((code) => depts.has(code));
      if (!inDept) return false;
    }
    if (levels.size > 0 && (!course.level || !levels.has(course.level))) return false;
    if (!matchesText(course, text, exactCodeFound)) return false;
    return !sectionFiltered || course.course.sections.some((s) => sectionMatches(s, query));
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
 * descriptions), best first: exact code, alias code, code prefix, department, title words, other words.
 */
export function paletteMatches(index: TermIndex, q: string, limit: number): IndexedCourse[] {
  const text = prepareTextQuery(q, index.subjects);
  if (text.kind === "none" || limit < 1) return [];
  const scored: { course: IndexedCourse; score: number }[] = [];
  for (const course of index.courses) {
    let score = 0;
    switch (text.kind) {
      case "code":
        score = course.code === text.code ? 100 : course.aliases.has(text.code) ? 90 : 0;
        break;
      case "prefix":
        score = matchesText(course, text, false) ? 80 : 0;
        break;
      case "dept":
        score =
          course.subject === text.subject
            ? 60
            : course.crossPostings.has(text.subject)
              ? 50
              : matchesText(course, text, false)
                ? 40
                : 0;
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
