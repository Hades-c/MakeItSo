import { routes, type CoursesParams } from "@/lib/routes";
import { isTermCode, type TermCode } from "@/lib/term";
import { CatalogQuerySchema, type CatalogQuery, type MeetingDay } from "@/lib/types/catalog";

/**
 * /courses URL state (PLAN §7 "State": the term, the search text and every filter live in search params, named
 * like CatalogQuerySchema so the page parses them with it). Pure and isomorphic.
 *
 * A malformed value (a bad time, an unknown requirement code, page=abc) is dropped, never a 500: the page parses
 * the params, removes each field the schema rejects and parses again, then reports which fields it ignored.
 */

export const COURSES_PAGE_SIZE = 20;

export type CoursesSearchParams = Record<string, string | string[] | undefined>;

export interface ParsedCoursesQuery {
  /** The validated query (term undefined = the default browse term). */
  query: CatalogQuery;
  /** URL keys that were present but invalid, and were ignored. */
  ignored: string[];
}

const KEYS = [
  "term",
  "q",
  "dept",
  "req",
  "days",
  "after",
  "before",
  "openOnly",
  "level",
  "page",
] as const;

function pick(params: CoursesSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of KEYS) {
    const value = params[key];
    if (value === undefined) continue;
    // A form submits an empty select as "" ("All departments"): that means no filter.
    const values = (Array.isArray(value) ? value : [value]).filter((v) => v.trim() !== "");
    if (values.length === 0) continue;
    out[key] = values.length === 1 ? values[0]! : values;
  }
  return out;
}

/** Parse /courses search params. Never throws. */
export function parseCoursesQuery(params: CoursesSearchParams): ParsedCoursesQuery {
  const input = pick(params);
  const ignored: string[] = [];
  for (let attempt = 0; attempt < KEYS.length + 1; attempt++) {
    const parsed = CatalogQuerySchema.safeParse({ ...input, pageSize: COURSES_PAGE_SIZE });
    if (parsed.success) {
      const query = parsed.data;
      // after must be before `before`; a reversed window is dropped (both ends), not silently swapped.
      if (query.after && query.before && query.after >= query.before) {
        ignored.push("after", "before");
        delete query.after;
        delete query.before;
      }
      return { query, ignored };
    }
    const bad = new Set(
      parsed.error.issues
        .map((issue) => issue.path[0])
        .filter((key): key is string => typeof key === "string" && key in input),
    );
    if (bad.size === 0) break;
    for (const key of bad) {
      ignored.push(key);
      delete input[key];
    }
  }
  return { query: CatalogQuerySchema.parse({ pageSize: COURSES_PAGE_SIZE }), ignored };
}

/** The URL params of a query (the term made explicit), for links that keep the current state. */
export function queryParams(query: CatalogQuery, term: TermCode): CoursesParams {
  return {
    term,
    q: query.q,
    dept: query.dept,
    req: query.req,
    days: query.days,
    after: query.after,
    before: query.before,
    openOnly: query.openOnly,
    level: query.level,
    page: query.page,
  };
}

/** /courses href for the query with some params changed (page resets unless it is the change). */
export function coursesHref(
  query: CatalogQuery,
  term: TermCode,
  change: Partial<CoursesParams> = {},
): string {
  const base = queryParams(query, term);
  return routes.courses({ ...base, page: "page" in change ? change.page : undefined, ...change });
}

/** True when anything but the term narrows the search. */
export function hasFilters(query: CatalogQuery): boolean {
  return Boolean(
    query.q ||
    query.dept.length ||
    query.req.length ||
    query.days.length ||
    query.after ||
    query.before ||
    query.openOnly ||
    query.level.length,
  );
}

/** Weekday filter options (the days a student is free). */
export const DAY_OPTIONS: readonly { value: MeetingDay; label: string; short: string }[] = [
  { value: "M", label: "Monday", short: "Mon" },
  { value: "T", label: "Tuesday", short: "Tue" },
  { value: "W", label: "Wednesday", short: "Wed" },
  { value: "R", label: "Thursday", short: "Thu" },
  { value: "F", label: "Friday", short: "Fri" },
];

/** Course levels. */
export const LEVEL_OPTIONS = [
  { value: "100", label: "100-level" },
  { value: "200", label: "200-level" },
  { value: "300", label: "300-level" },
  { value: "400", label: "400-level" },
] as const;

/** "HH:MM" every half hour from 7:00 to 22:00 with a readable label ("8:00 am"). */
export const TIME_OPTIONS: readonly { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let minutes = 7 * 60; minutes <= 22 * 60; minutes += 30) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ value, label: `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}` });
  }
  return out;
})();

/** The label of a time value, or the value itself when it is not on the half-hour list. */
export function timeLabel(value: string): string {
  return TIME_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/** A term code from a param, else null. */
export function termParam(value: string | string[] | undefined): TermCode | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first && isTermCode(first) ? first : null;
}
