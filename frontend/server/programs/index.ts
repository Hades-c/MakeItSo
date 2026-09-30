import "server-only";
import type {
  AcademicProgram,
  AcademicProgramSummary,
  ProgramOfferingKind,
  ProgramSyncResult,
} from "@/lib/types/catalog";
import { ACALOG_CATALOG } from "@/server/programs/catalog-info";
import {
  catalogRows,
  findIn,
  getProgramWith,
  listProgramsFrom,
  liveDeps,
  namesOf,
  type ProgramFilter,
  type ProgramMatch,
  runProgramSync,
} from "@/server/programs/service";

/**
 * Academic programs service (Acalog; PLAN §5 "Majors", §6.1 W1b; owner W1b).
 *
 * Source: catalog.davidson.edu/widget-api/catalog/4 (the 2026-2027 catalog) through fetchExternal("catalog", …):
 * `/programs?page-size=100` for the list and `/program/{id}` for each department/program page. Seeded from the
 * checked-in snapshot (server/programs/snapshot.json: every public program and its official offering names), so
 * everything here works before the first sync. The weekly sync (GET /api/cron/programs) refreshes the list and the
 * pages Acalog reports as changed; other pages load on first request and are cached for 7 days. A failed refresh
 * (non-200, WAF 202 challenge, empty or non-JSON body, fewer than 45 public programs, or a list that would drop
 * more than a fifth of the programs) keeps the last good copy and is recorded (recordSync("catalog", …) once per
 * sync run; the program document for a page, which also holds off asking Acalog again for 30 minutes).
 *
 * Requirement text is Acalog's, as text: each offering gets its own sections plus the page's sections that apply
 * to it (see server/programs/parse.ts); the page's other sections (honors, course catalog, numbering rationale)
 * are stored too. When another page also states an offering (FMDS's Digital Studies minor), both texts are shown.
 *
 * Official names are "<Kind> in <Subject> (<Degree> Degree)", from Acalog's headings: "Major in Computer Science
 * (B.S. Degree)", "Minor in Economics", "Interdisciplinary Minor in Data Science". The profile stores these names;
 * findProgramByName maps legacy and free-text names onto them.
 *
 * No per-user data: nothing to register with server/account/erasers.ts.
 */

export type { ProgramFilter, ProgramMatch };

/** Every program page of the catalog, sorted by name, with its offering names (filtered by kind when asked). */
export async function listPrograms(filter: ProgramFilter = {}): Promise<AcademicProgramSummary[]> {
  return listProgramsFrom(await catalogRows(), filter);
}

/**
 * One program by Acalog id with requirement text; null when the catalog does not list it. Throws
 * ApiError(503, "unavailable") when the page has never been read and Acalog cannot be reached.
 */
export async function getProgram(acalogId: number): Promise<AcademicProgram | null> {
  return getProgramWith(acalogId, liveDeps);
}

/**
 * Official offering names of one kind, sorted ("Major in Computer Science (B.S. Degree)"): the enum for
 * onboarding, the profile and the AI career plan.
 */
export async function officialProgramNames(kind: ProgramOfferingKind): Promise<string[]> {
  return namesOf(await catalogRows(), [kind]);
}

export interface ProgramNames {
  catalogYear: string;
  /** Majors (incl. interdisciplinary majors), for Profile.majors and the AI's `majors` enum. */
  majors: string[];
  /** Minors and interdisciplinary minors, for Profile.minors and the AI's `minors` enum. */
  minors: string[];
  /** Every official offering name (any kind). */
  all: string[];
}

/**
 * All official names at once, sorted, for zod enums in profile validation and AI output schemas:
 * `z.enum(names.majors as [string, ...string[]])` (each list is non-empty for the 2026-2027 catalog).
 */
export async function programNames(): Promise<ProgramNames> {
  const rows = await catalogRows();
  return {
    catalogYear: ACALOG_CATALOG.year,
    majors: namesOf(rows, ["major"]),
    minors: namesOf(rows, ["minor", "interdisciplinary-minor"]),
    all: namesOf(rows, ["major", "minor", "interdisciplinary-minor", "concentration", "other"]),
  };
}

/**
 * The official offering a free-text name means: the official name in any spelling ("&" or "and", punctuation,
 * case), a subject ("Economics" → the major, "Economics (minor)" → the minor, "Computer Science, B.S." → the
 * major), or a department page with a single offering of that kind. A kind the text names is a constraint:
 * "Physics minor" is null (two Physics minors, no fallback to the major), and so is "Minor in Economics" with
 * `kinds: ["major"]`. Null when nothing or more than one offering matches ("Classics" has two majors).
 * `kinds` restricts the candidates (e.g. ["minor", "interdisciplinary-minor"] for Profile.minors).
 */
export async function findProgramByName(
  name: string,
  options: { kinds?: readonly ProgramOfferingKind[] } = {},
): Promise<ProgramMatch | null> {
  return findIn(await catalogRows(), name, options.kinds);
}

/** Weekly refresh; records the run with recordSync("catalog", ...). */
export async function syncPrograms(): Promise<ProgramSyncResult> {
  return runProgramSync(liveDeps);
}
