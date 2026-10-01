import type { ApiIssue } from "@/lib/api/errors";
import type { Profile } from "@/lib/api/profile";
import { dayKey } from "@/lib/format";
import {
  CLASS_STANDINGS,
  classStanding,
  isSummer,
  termCodeFor,
  termLabel,
  termsBetween,
  TERM_TIME_ZONE,
  type ClassStanding,
  type ClassStandingResult,
  type TermCode,
} from "@/lib/term";

/**
 * Choices and rules for the profile's Academics form (PLAN §3 /profile; the server rules live in
 * server/auth/profile.ts and are mirrored here only to answer before a round trip). Pure and isomorphic: "now"
 * comes from the server as a prop, so server and browser render the same options.
 */

export const STANDING_LABELS: Readonly<Record<ClassStanding, string>> = {
  incoming: "Incoming student",
  "first-year": "First-year",
  sophomore: "Sophomore",
  junior: "Junior",
  senior: "Senior",
  graduated: "Graduated",
};

export const STANDING_CHOICES: readonly ClassStanding[] = CLASS_STANDINGS;

/** The calendar year the academic year at `now` ends in (rolls over on June 1, ET), as lib/term does. */
export function academicYearEndAt(now: Date | string): number {
  const [year, month] = dayKey(now, TERM_TIME_ZONE).split("-").map(Number);
  return (month ?? 1) >= 6 ? (year ?? 0) + 1 : (year ?? 0);
}

/**
 * Graduation years to offer: last year's class (just graduated) through the class entering next year, plus the
 * stored year when it is outside that span, newest last.
 */
export function graduationYearOptions(now: Date | string, current?: number | null): number[] {
  const end = academicYearEndAt(now);
  const years = new Set<number>();
  for (let year = end - 1; year <= end + 4; year++) years.add(year);
  if (typeof current === "number" && Number.isInteger(current)) years.add(current);
  return [...years].sort((a, b) => a - b);
}

/** The usual first term for a class: Fall, four years before graduation (server/auth defaultFirstTerm). */
export function defaultFirstTermFor(graduationYear: number): TermCode {
  return termCodeFor("Fall", graduationYear - 4);
}

/**
 * The server's rule (server/auth/profile.ts): a Fall or Spring term whose academic year starts between 8 years
 * before graduation and the graduation year's Spring.
 */
export function firstTermFits(firstTerm: TermCode, graduationYear: number): boolean {
  if (isSummer(firstTerm)) return false;
  const startYear = Number(firstTerm.slice(0, 4));
  return startYear >= graduationYear - 8 && startYear <= graduationYear - 1;
}

export interface TermOption {
  code: TermCode;
  label: string;
}

/**
 * First-term choices for a graduation year: Fall six years before graduation through the Spring before it
 * (regular terms only), plus the stored term when it still fits but lies earlier.
 */
export function firstTermOptions(graduationYear: number, current?: TermCode | null): TermOption[] {
  const codes = termsBetween(`${graduationYear - 6}01`, `${graduationYear - 1}02`);
  if (current && firstTermFits(current, graduationYear) && !codes.includes(current)) {
    codes.push(current);
    codes.sort();
  }
  return codes.map((code) => ({ code, label: termLabel(code) }));
}

/** "Sophomore (from your graduation year)" / "Junior (you set this)". */
export function standingSummary(result: ClassStandingResult): string {
  const label = STANDING_LABELS[result.standing];
  return result.estimated ? `${label} (from your graduation year)` : `${label} (set by you)`;
}

export function derivedStanding(
  graduationYear: number,
  now: Date | string,
  override: ClassStanding | null,
): ClassStandingResult {
  return classStanding(graduationYear, now, override);
}

/** Map server issues ("majors.1", "firstTerm") onto form fields, first message per field. */
export function fieldErrorsFromIssues<K extends string>(
  issues: readonly ApiIssue[],
  fields: readonly K[],
): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const issue of issues) {
    const field = fields.find((name) => issue.path === name || issue.path.startsWith(`${name}.`));
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export type AcademicsValues = Pick<
  Profile,
  "majors" | "minors" | "graduationYear" | "firstTerm" | "standingOverride"
>;

/**
 * The PATCH body for an Academics save: only the fields that differ from what is saved. The server re-checks
 * every name it is sent, so an untouched stored major the catalog no longer lists (a program renamed between
 * catalog years) is never re-sent and never blocks a change to the graduation year, first term or standing.
 */
export function changedAcademics(
  values: AcademicsValues,
  saved: AcademicsValues,
): Partial<AcademicsValues> {
  const body: Partial<AcademicsValues> = {};
  if (!sameList(values.majors, saved.majors)) body.majors = values.majors;
  if (!sameList(values.minors, saved.minors)) body.minors = values.minors;
  if (values.graduationYear !== saved.graduationYear) body.graduationYear = values.graduationYear;
  if (values.firstTerm !== saved.firstTerm) body.firstTerm = values.firstTerm;
  if (values.standingOverride !== saved.standingOverride) {
    body.standingOverride = values.standingOverride;
  }
  return body;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Drop blanks and repeats, keep the order (a student picking the same major twice saves it once). */
export function cleanNames(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}
