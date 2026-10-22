import "server-only";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/types/common";

/**
 * Course codes a requirement text mentions (AcademicProgram.offerings[].courseCodes). Pure.
 *
 * What counts as a mention:
 *   - a code with its prefix, "CSC 121" or "ARB496", and the numbers listed right after it with the same prefix
 *     ("SPA 271 and 272", "ECO 202, 203 or 204");
 *   - the page's own subject written as a word ("Economics 202 and 203", "Physics 120, 125 or 130"), mapped to the
 *     page's course prefix;
 *   - on a department page (one with its own course catalog list), a bare number ("History of Philosophy: two of
 *     105, 106, 107, 108"), only when the page's course lists name that course, and not right after another
 *     subject's name ("Mathematics 150 and 160" on the Physics page).
 * What does not: thresholds and ranges ("courses above FRE 201", "numbered above GRE 200", "POL 120-139",
 * "Economics 180-184", "courses numbered 400 to 460", "300-level"), and words that are not prefixes (GPA, SAT).
 * A code written with its prefix is kept even when no course list on the page names it (the department's lists
 * leave out real courses such as CLA 480): whether it exists in a given term is for validateCourseCodes to say.
 */

export interface SubjectAlias {
  /** A subject word as the page writes it ("Economics", "German"). */
  word: string;
  /** The course prefix it stands for ("ECO"). */
  prefix: string;
}

export interface CodeContext {
  /** The page's subject words and their prefix ("Economics 202" → ECO 202). */
  aliases?: readonly SubjectAlias[];
  /** The department's own prefix, when the page has a course catalog list: enables bare numbers. */
  departmentPrefix?: string | null;
  /** Every code the page's course lists name ("PHI 105", …): a bare number counts only if listed. */
  listed?: ReadonlySet<string>;
}

const CODE_IN_TEXT = /\b([A-Z]{2,4})\s?(\d{3})([A-Z]?)\b/g;
const BARE_NUMBER = /(?<![\d.])\b(\d{3})([A-Z]?)\b(?![.,]\d)/g;
/** Upper-case words followed by three digits that are not Davidson course prefixes. */
const NOT_A_PREFIX = new Set([
  "ACT",
  "AND",
  "AP",
  "FOR",
  "GMAT",
  "GPA",
  "IB",
  "LSAT",
  "MCAT",
  "NOTE",
  "OR",
  "ROOM",
  "SAT",
  "TOEFL",
  "US",
  "USA",
]);

/**
 * A number after these words is a threshold or a range end ("above FRE 201", "numbered 400 to 460", "between 100
 * and 116"); "in addition to CSC 121" is not.
 */
const THRESHOLD_BEFORE =
  /(?:\b(?:above|below|beyond|than|numbered|between)[ \t]+(?:(?:the|a|an)[ \t]+)?|(?<!\d)\d{3}[A-Z]?[ \t]+(?:to|through|thru)[ \t]+|\bbetween[ \t]+\d{3}[ \t]+and[ \t]+)$/i;
/** …and after these ("300-level", "201 or above", "260 level and above"). */
const THRESHOLD_AFTER =
  /^[ \t]*(?:-[ \t]*|[ \t])(?:level|or above|or higher|and above|and higher)\b/i;
/** "310-319", "120 – 139": a range (the start is not a course either); "488-9" and "115-116" are sequences. */
const RANGE_AFTER = /^[ \t]*[-–—][ \t]*(\d{3})\b/;
/** The end of a range ("319" in "310-319"); a list bullet after "to 1850" on the line before is not one. */
const RANGE_BEFORE = /(?<!\d)\d{3}[ \t]*[-–—][ \t]*$/;
/** Numbers listed after a code on the same line: ", 203", " and 272", " or 130", "/ 272". */
const TAIL = /[ \t]*(?:[,/&][ \t]*)?(?:(?:or|and|plus)[ \t]+)?(\d{3})([A-Z]?)\b/y;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Found {
  index: number;
  code: string;
}

function isRangeStart(text: string, end: number, number: string): boolean {
  const range = RANGE_AFTER.exec(text.slice(end, end + 12));
  if (!range?.[1]) return false;
  return Number(range[1]) - Number(number) > 1;
}

/** A threshold ("above FRE 201", "300-level") or, for a bare or listed number, the end of a range. */
function isThreshold(text: string, start: number, end: number, rangeEnd: boolean): boolean {
  return (
    THRESHOLD_BEFORE.test(text.slice(Math.max(0, start - 30), start)) ||
    THRESHOLD_AFTER.test(text.slice(end, end + 20)) ||
    (rangeEnd && RANGE_BEFORE.test(text.slice(Math.max(0, start - 8), start)))
  );
}

/**
 * Course codes in `text`, normalised ("ARB496" → "ARB 496"), de-duplicated, in order of first mention (see the
 * module comment for the rules).
 */
export function courseCodesIn(text: string, context: CodeContext = {}): string[] {
  const aliases = context.aliases ?? [];
  const department = context.departmentPrefix ?? null;
  const listed = context.listed ?? new Set<string>();
  const found: Found[] = [];
  /** Character ranges already read as (part of) a code, so bare numbers do not read them again. */
  const covered: [number, number][] = [];

  const push = (index: number, prefix: string, number: string, suffix: string) => {
    const code = normalizeCourseCode(`${prefix} ${number}${suffix}`);
    if (COURSE_CODE_PATTERN.test(code)) found.push({ index, code });
  };

  /** The end of the numbers listed after `end` ("…, 203 and 204"). */
  const tailEnd = (
    end: number,
    each?: (number: string, suffix: string, start: number, end: number) => void,
  ) => {
    let last = end;
    TAIL.lastIndex = end;
    let next: RegExpExecArray | null;
    while ((next = TAIL.exec(text))) {
      const number = next[1] ?? "";
      const suffix = next[2] ?? "";
      const stop = next.index + next[0].length;
      each?.(number, suffix, stop - number.length - suffix.length, stop);
      last = stop;
    }
    return last;
  };

  /** A code at [start, end) and the numbers listed after it with the same prefix. */
  const take = (prefix: string, number: string, suffix: string, start: number, end: number) => {
    if (!isRangeStart(text, end, number) && !isThreshold(text, start, end, false)) {
      push(start, prefix, number, suffix);
    }
    const last = tailEnd(end, (tailNumber, tailSuffix, tailStart, tailStop) => {
      if (isRangeStart(text, tailStop, tailNumber) || isThreshold(text, tailStart, tailStop, true))
        return;
      push(tailStart, prefix, tailNumber, tailSuffix);
    });
    covered.push([start, last]);
  };

  for (const match of text.matchAll(CODE_IN_TEXT)) {
    const prefix = match[1] ?? "";
    if (NOT_A_PREFIX.has(prefix)) continue;
    take(prefix, match[2] ?? "", match[3] ?? "", match.index, match.index + match[0].length);
  }
  for (const alias of aliases) {
    const head = new RegExp(`\\b${escapeRegExp(alias.word)}\\s+(\\d{3})([A-Z]?)\\b`, "g");
    for (const match of text.matchAll(head)) {
      take(
        alias.prefix,
        match[1] ?? "",
        match[2] ?? "",
        match.index,
        match.index + match[0].length,
      );
    }
  }
  if (department !== null && listed.size > 0) {
    for (const match of text.matchAll(BARE_NUMBER)) {
      const start = match.index;
      const end = start + match[0].length;
      if (covered.some(([from, to]) => start >= from && start < to)) continue;
      // "Mathematics 150 and 160" on the Physics page names another department's courses, not PHY 150/160.
      if (/\b[A-Z][a-z]+[ \t]+$/.test(text.slice(Math.max(0, start - 30), start))) {
        covered.push([start, tailEnd(end)]);
        continue;
      }
      if (isRangeStart(text, end, match[1] ?? "") || isThreshold(text, start, end, true)) continue;
      const code = `${department} ${match[1] ?? ""}${match[2] ?? ""}`;
      if (listed.has(code)) found.push({ index: start, code });
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const { code } of found.sort((a, b) => a.index - b.index)) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/** The code a course list entry starts with ("BIO 209 - Bioinformatics Programming" → "BIO 209"), if any. */
export function listedCode(title: string): string | null {
  const match = /^([A-Z]{2,4})\s?(\d{3}[A-Z]?)\b/.exec(title.trim());
  if (!match) return null;
  const code = normalizeCourseCode(`${match[1]} ${match[2]}`);
  return COURSE_CODE_PATTERN.test(code) ? code : null;
}
