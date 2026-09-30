import { dayKey } from "@/lib/format";

/**
 * Davidson term codes and academic-calendar arithmetic (PLAN §4.1.1, §5 "Terms"). Pure and isomorphic.
 *
 * A term code is `YYYY` + `01 | 02 | 03`, where YYYY is the first calendar year of the academic year:
 *   - `YYYY01` = Fall YYYY          (202601 = Fall 2026)
 *   - `YYYY02` = Spring YYYY+1      (202602 = Spring 2027)
 *   - `YYYY03` = Summer YYYY+1      (202503 = Summer 2026)
 * Numeric order of codes is chronological order, so codes sort as strings or numbers.
 *
 * Only academic years 1988–2099 are term codes. Davidson moved from trimesters (Fall/Winter/Spring, where "YYYY02"
 * meant Winter) to semesters in 1988-89, and Banner also lists pseudo-terms such as 000001 (Transfer), 000002
 * (Junior Year Abroad) and 000003 (Advanced Placement, flagged summer): none of them may reach a TermInfo list or a
 * URL, so the pattern itself rejects them.
 *
 * "Regular" terms are Fall and Spring. Summer terms can hold plan entries but are never a default.
 *
 * Conventions:
 *   - Parsers (`parseTermCode`, `termLabel`, `isTermCode`, `isSummer`, `isRegularTerm`) never throw.
 *   - Arithmetic (`termSeason`, `compareTerms`, `nextRegularTerm`, `prevRegularTerm`, `termsBetween`,
 *     `termCodeFor`) throws a RangeError for invalid input: validate at the edge (zod `TermCodeSchema` in
 *     lib/types/common.ts).
 *   - "Now" is read in America/New_York. Upstream term start/end values are UTC-midnight stamps and are compared
 *     as UTC calendar dates ("YYYY-MM-DD").
 */

export type Season = "Fall" | "Spring" | "Summer";

/** A term code string such as "202602". Validate with `isTermCode` or `TermCodeSchema`. */
export type TermCode = string;

/** First and last academic start year a term code can have (semesters began in 1988-89). */
export const MIN_TERM_ACADEMIC_YEAR = 1988;
export const MAX_TERM_ACADEMIC_YEAR = 2099;

/**
 * `YYYY` 1988–2099 + `0` + `1|2|3`: capture 1 = academic start year, capture 2 = 1 (Fall), 2 (Spring) or 3
 * (Summer). Rejects Banner pseudo-terms (000001 Transfer, ...) and the trimester era (196002 = Winter 1960-61).
 */
export const TERM_CODE_PATTERN = /^(198[89]|199\d|20\d\d)0([1-3])$/;

/** The time zone all "today/now" term logic uses (PLAN §5 "Dates/times"). */
export const TERM_TIME_ZONE = "America/New_York";

export interface Term {
  code: TermCode;
  season: Season;
  /** Calendar year the term takes place in (Spring and Summer = academic start year + 1). */
  year: number;
  /** "Fall 2026", "Spring 2027", "Summer 2026". */
  label: string;
}

const SEASON_BY_DIGIT: Readonly<Record<string, Season>> = {
  "1": "Fall",
  "2": "Spring",
  "3": "Summer",
};

export function isTermCode(value: unknown): value is TermCode {
  return typeof value === "string" && TERM_CODE_PATTERN.test(value);
}

/** Parse a term code; null when it is not a valid Fall/Spring/Summer code. */
export function parseTermCode(code: string): Term | null {
  const match = TERM_CODE_PATTERN.exec(code);
  if (!match?.[1] || !match[2]) return null;
  const academicYear = Number(match[1]);
  const season = SEASON_BY_DIGIT[match[2]];
  if (!season) return null;
  const year = season === "Fall" ? academicYear : academicYear + 1;
  return { code, season, year, label: `${season} ${year}` };
}

/** "Spring 2027" for "202602"; the input itself when it cannot be parsed. */
export function termLabel(code: string): string {
  return parseTermCode(code)?.label ?? code;
}

function mustParse(code: TermCode): Term {
  const term = parseTermCode(code);
  if (!term) throw new RangeError(`Invalid term code: ${JSON.stringify(code)}`);
  return term;
}

/** "Fall" | "Spring" | "Summer". Throws RangeError for an invalid code. */
export function termSeason(code: TermCode): Season {
  return mustParse(code).season;
}

/** True for a valid summer code (YYYY03); false otherwise, including invalid input. */
export function isSummer(code: string): boolean {
  return parseTermCode(code)?.season === "Summer";
}

/** True for a valid Fall or Spring code. */
export function isRegularTerm(code: string): boolean {
  const season = parseTermCode(code)?.season;
  return season === "Fall" || season === "Spring";
}

/** Sort comparator in chronological order (negative when a is earlier). Throws RangeError for invalid codes. */
export function compareTerms(a: TermCode, b: TermCode): number {
  mustParse(a);
  mustParse(b);
  return Number(a) - Number(b);
}

/**
 * The code for a season in a calendar year: termCodeFor("Fall", 2026) = "202601",
 * termCodeFor("Spring", 2027) = "202602", termCodeFor("Summer", 2026) = "202503".
 * (For example to convert legacy "semester + year" plan entries.)
 */
export function termCodeFor(season: Season, calendarYear: number): TermCode {
  if (!Number.isInteger(calendarYear)) {
    throw new RangeError(`Invalid calendar year: ${calendarYear}`);
  }
  const code =
    season === "Fall"
      ? `${calendarYear}01`
      : `${calendarYear - 1}${season === "Spring" ? "02" : "03"}`;
  return mustBeTermCode(code);
}

/** `code` when it is a term code; RangeError at the edges of the supported years (1988–2099). */
function mustBeTermCode(code: string): TermCode {
  if (!isTermCode(code)) {
    throw new RangeError(
      `No term code ${JSON.stringify(code)}: terms run from ${MIN_TERM_ACADEMIC_YEAR}01 to ${MAX_TERM_ACADEMIC_YEAR}03`,
    );
  }
  return code;
}

/** The next Fall/Spring term: Fall → Spring; Spring → Fall; Summer → the Fall right after it. */
export function nextRegularTerm(code: TermCode): TermCode {
  const season = termSeason(code);
  const year = Number(code.slice(0, 4));
  return mustBeTermCode(season === "Fall" ? `${year}02` : `${year + 1}01`);
}

/** The previous Fall/Spring term: Fall → Spring; Spring → Fall; Summer → the Spring right before it. */
export function prevRegularTerm(code: TermCode): TermCode {
  const season = termSeason(code);
  const year = Number(code.slice(0, 4));
  if (season === "Fall") return mustBeTermCode(`${year - 1}02`);
  return season === "Spring" ? `${year}01` : `${year}02`;
}

export interface TermsBetweenOptions {
  /** Include summer terms (default false). */
  includeSummer?: boolean;
}

/**
 * Every term from `from` to `to`, both inclusive, in chronological order; empty when `from` is after `to`.
 * Without `includeSummer`, summer terms (a summer endpoint too) are left out.
 */
export function termsBetween(
  from: TermCode,
  to: TermCode,
  { includeSummer = false }: TermsBetweenOptions = {},
): TermCode[] {
  if (compareTerms(from, to) > 0) return [];
  const out: TermCode[] = [];
  let year = Number(from.slice(0, 4));
  let digit = Number(from.slice(5));
  const last = Number(to);
  for (let code = `${year}0${digit}`; Number(code) <= last; code = `${year}0${digit}`) {
    if (includeSummer || digit !== 3) out.push(code);
    digit += 1;
    if (digit > 3) {
      digit = 1;
      year += 1;
    }
  }
  return out;
}

/**
 * FALLBACK ONLY (use `currentTermFrom` with the Davidson terms list): the term a date falls in by month, in
 * America/New_York. January–May → Spring, June–July → Summer, August–December → Fall.
 */
export function termFromDateET(date: Date | string | number): TermCode {
  const [yearText, monthText] = dayKey(date, TERM_TIME_ZONE).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (month >= 8) return termCodeFor("Fall", year);
  if (month >= 6) return termCodeFor("Summer", year);
  return termCodeFor("Spring", year);
}

/** A term boundary as the Davidson API or TermInfo carries it: "YYYY-MM-DD", an ISO string, epoch ms or a Date. */
export type TermDate = string | number | Date;

/** The part of TermInfo (lib/types/catalog.ts) that the resolvers read. */
export interface TermScheduleEntry {
  code: TermCode;
  /** Hint only: the code decides (YYYY03 = summer). A term flagged summer is never current. */
  isSummer?: boolean;
  /** Upstream `is_active`: used only when the list has no dates covering or preceding today. */
  isActive?: boolean;
  /** First day: UTC-midnight stamp or "YYYY-MM-DD". */
  startDate?: TermDate | null;
  /** Last day: UTC-midnight stamp or "YYYY-MM-DD". */
  endDate?: TermDate | null;
}

export interface ResolveOptions {
  now: Date | string | number;
}

/** If the latest started term ended longer ago than this, the list is stale (the longest real gap is ~105 days). */
const STALE_AFTER_DAYS = 150;

/** "YYYY-MM-DD" of a term boundary read as a UTC calendar date; null when missing or invalid. */
function termDayKey(value: TermDate | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * The current regular (Fall/Spring) term at `now` (PLAN §5): the non-summer term in session; between terms and
 * during summer, the most recent non-summer term that has started. When the list has no usable dates (or is
 * stale), falls back to the upstream `isActive` hint, then to `termFromDateET(now)` (summer → the Spring before).
 * Never a summer term, never null.
 */
export function currentTermFrom(
  terms: readonly TermScheduleEntry[],
  { now }: ResolveOptions,
): TermCode {
  const today = dayKey(now, TERM_TIME_ZONE);
  const regular = terms
    .filter((t) => isRegularTerm(t.code) && t.isSummer !== true)
    .sort((a, b) => compareTerms(a.code, b.code));

  const dated = regular.flatMap((t) => {
    const start = termDayKey(t.startDate);
    const end = termDayKey(t.endDate);
    return start && end ? [{ code: t.code, start, end }] : [];
  });

  const inSession = dated.find((t) => t.start <= today && today <= t.end);
  if (inSession) return inSession.code;

  const started = dated.filter((t) => t.start <= today);
  const latest = started[started.length - 1];
  if (latest && daysBetweenKeys(latest.end, today) <= STALE_AFTER_DAYS) return latest.code;

  // A stale list's flags are stale too; only trust `isActive` when no dated term has started.
  const active = latest ? undefined : regular.find((t) => t.isActive === true);
  if (active) return active.code;

  const fallback = termFromDateET(now);
  return isSummer(fallback) ? prevRegularTerm(fallback) : fallback;
}

/**
 * The registration term at `now` (PLAN §5): the first non-summer term after `currentTermFrom(terms, {now})`. It is
 * the default term for /courses, "Next semester" and Add-to-plan. It is NOT the upstream `is_next` flag, which
 * points at the summer term during spring.
 */
export function registrationTermFrom(
  terms: readonly TermScheduleEntry[],
  options: ResolveOptions,
): TermCode {
  return nextRegularTerm(currentTermFrom(terms, options));
}

export const CLASS_STANDINGS = [
  "incoming",
  "first-year",
  "sophomore",
  "junior",
  "senior",
  "graduated",
] as const;

export type ClassStanding = (typeof CLASS_STANDINGS)[number];

export interface ClassStandingResult {
  standing: ClassStanding;
  /** True when derived from the graduation year (real standing depends on credits); false for an override. */
  estimated: boolean;
}

/**
 * Class standing from the expected graduation year. The academic year rolls over on June 1 in America/New_York
 * (after Davidson's mid-May commencement): on 2026-09-30 the class of 2027 are seniors and the class of 2030
 * first-years, the class of 2031 is "incoming" and the class of 2026 "graduated". A student-set override wins and
 * is not an estimate.
 */
export function classStanding(
  gradYear: number,
  now: Date | string | number,
  override?: ClassStanding | null,
): ClassStandingResult {
  if (override) return { standing: override, estimated: false };
  if (!Number.isInteger(gradYear)) throw new RangeError(`Invalid graduation year: ${gradYear}`);
  const [yearText, monthText] = dayKey(now, TERM_TIME_ZONE).split("-");
  const academicYearEnd = Number(monthText) >= 6 ? Number(yearText) + 1 : Number(yearText);
  const yearsLeft = gradYear - academicYearEnd;
  const byYearsLeft: readonly ClassStanding[] = ["senior", "junior", "sophomore", "first-year"];
  const standing: ClassStanding =
    yearsLeft < 0 ? "graduated" : (byYearsLeft[yearsLeft] ?? "incoming");
  return { standing, estimated: true };
}
