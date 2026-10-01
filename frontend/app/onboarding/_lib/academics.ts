import type { ProfilePatchBody } from "@/lib/api/profile";
import { dayKey } from "@/lib/format";
import {
  isSummer,
  termCodeFor,
  termLabel,
  termsBetween,
  TERM_TIME_ZONE,
  type TermCode,
} from "@/lib/term";

/**
 * Step 1 rules (PLAN §3 /onboarding 1): graduation year, first term at Davidson (default: Fall of graduationYear − 4)
 * and majors/minors as official Acalog names. "Undecided" is a UI-only major choice that saves `majors: []`.
 * The server re-checks everything (server/auth/profile.ts updateProfile); these mirror its rules so the form can
 * answer before a round trip. Pure: "now" comes from the server as a prop.
 */

/** The UI-only "no major yet" choice. Never sent: it saves as `majors: []`. */
export const UNDECIDED = "Undecided";

/** At most this many majors and minors (lib/api/profile ProfileSchema). */
export const MAX_PROGRAMS = 3;

/** The calendar year the academic year at `now` ends in (rolls over on June 1, ET, as lib/term classStanding). */
export function academicYearEndAt(now: Date | string): number {
  const [year, month] = dayKey(now, TERM_TIME_ZONE).split("-").map(Number);
  return (month ?? 1) >= 6 ? (year ?? 0) + 1 : (year ?? 0);
}

/** This year's first-year class (the default for an account that never set one). */
export function firstYearClass(now: Date | string): number {
  return academicYearEndAt(now) + 3;
}

/**
 * Graduation years to offer: last spring's class through the class entering next fall (2026–2031 on 2026-09-30),
 * plus the stored year when it lies outside that span, ascending.
 */
export function graduationYearOptions(now: Date | string, stored?: number | null): number[] {
  const end = academicYearEndAt(now);
  const years = new Set<number>();
  for (let year = end - 1; year <= end + 4; year++) years.add(year);
  if (typeof stored === "number" && Number.isInteger(stored)) years.add(stored);
  return [...years].sort((a, b) => a - b);
}

/** Fall, four years before graduation. */
export function defaultFirstTerm(graduationYear: number): TermCode {
  return termCodeFor("Fall", graduationYear - 4);
}

/**
 * The server's rule: a Fall or Spring term whose academic year starts between 8 years before graduation and the
 * graduation year's Spring.
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
 * First-term choices for a graduation year: Fall six years before graduation through the Spring before it (regular
 * terms only, newest last), plus the stored term when it fits but lies earlier.
 */
export function firstTermOptions(graduationYear: number, stored?: TermCode | null): TermOption[] {
  const codes = termsBetween(`${graduationYear - 6}01`, `${graduationYear - 1}02`);
  if (stored && firstTermFits(stored, graduationYear) && !codes.includes(stored)) {
    codes.push(stored);
    codes.sort();
  }
  return codes.map((code) => ({ code, label: termLabel(code) }));
}

/**
 * The first term after a graduation-year change: kept when the student picked it themselves and it still fits,
 * else the default for the new year.
 */
export function firstTermAfterYearChange(
  firstTerm: TermCode,
  graduationYear: number,
  pickedByStudent: boolean,
): TermCode {
  return pickedByStudent && firstTermFits(firstTerm, graduationYear)
    ? firstTerm
    : defaultFirstTerm(graduationYear);
}

/** Drop blanks, "Undecided" and repeats; keep the order; at most MAX_PROGRAMS. */
export function cleanPrograms(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === UNDECIDED || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out.slice(0, MAX_PROGRAMS);
}

export interface AboutValues {
  graduationYear: number;
  firstTerm: TermCode;
  /** As picked; may hold "Undecided" or blanks (cleaned before saving). */
  majors: readonly string[];
  minors: readonly string[];
}

/** The PATCH /api/profile body step 1 saves: always the year and the first term, the cleaned program lists. */
export function aboutPatch(values: AboutValues): ProfilePatchBody {
  return {
    graduationYear: values.graduationYear,
    firstTerm: values.firstTerm,
    majors: cleanPrograms(values.majors),
    minors: cleanPrograms(values.minors),
  };
}

/**
 * A stored major or minor that is no longer an official name (W3 keeps such a name when the catalog drops it). The
 * step shows it as "(no longer offered)" so the student can see it, and asks for a current one before saving
 * (the server would reject it).
 */
export function isRetiredProgram(value: string, officialList: readonly string[]): boolean {
  const trimmed = value.trim();
  return trimmed !== "" && trimmed !== UNDECIDED && !officialList.includes(trimmed);
}

export interface AboutProblem {
  field: "firstTerm" | "majors" | "minors";
  /** The row of a major or minor. */
  index?: number;
  message: string;
}

/** A problem the form can name before saving, or null. `official` = the official names (to catch retired ones). */
export function aboutProblem(
  values: AboutValues,
  official?: { majors: readonly string[]; minors: readonly string[] },
): AboutProblem | null {
  if (!firstTermFits(values.firstTerm, values.graduationYear)) {
    return {
      field: "firstTerm",
      message: "The first term and the graduation year do not fit together.",
    };
  }
  if (official) {
    for (const [field, noun] of [
      ["majors", "major"],
      ["minors", "minor"],
    ] as const) {
      const index = values[field].findIndex((value) => isRetiredProgram(value, official[field]));
      if (index >= 0) {
        return {
          field,
          index,
          message: `“${values[field][index]?.trim()}” is no longer offered. Pick a current ${noun} or remove it.`,
        };
      }
    }
  }
  return null;
}
