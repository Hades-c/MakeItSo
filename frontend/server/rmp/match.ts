import "server-only";
import type { Instructor } from "@/lib/types/catalog";
import {
  type DepartmentRelation,
  departmentRelation,
  departmentsCompatible,
} from "@/server/rmp/departments";
import { areNicknames } from "@/server/rmp/nicknames";
import {
  isStaffName,
  nameTokens,
  normalizeName,
  SURNAME_PARTICLES,
  surnameTokens,
} from "@/server/rmp/normalize";
import { RMP_OVERRIDES, type RmpOverride } from "@/server/rmp/overrides";

/**
 * The RateMyProfessors matching engine (PLAN §5 "Ratings (RMP)", §9 "RMP"). Pure: no I/O, deterministic.
 *
 * An instructor from the course API is matched against Davidson roster rows (already filtered to Davidson's
 * school id at ingest):
 *   1. "Staff" → staff (no lookup).
 *   2. An override (server/rmp/overrides.ts) decides alone: a profile, or an explicit no-match.
 *   3. Candidates: rows whose name matches. The SURNAME must match (exact, or token subset: Vaz ↔ Vaz-Hooper,
 *      Keith ↔ Villa Keith, St Clair ↔ St. Clair, but never through a particle alone and never Sainte-Claire) AND
 *      the GIVEN name must match (exact, a nickname-table pair such as Chris ↔ Christopher, a leading-name match
 *      such as Jia ↔ Jia Yi, or an initial) — never surname-only, never a mere prefix (Chris ↔ Christina). Two
 *      swap forms count too: first/last exchanged, and a compound surname stored as RMP first + last (API
 *      "Shyam Gouri Suresh" ↔ RMP "Suresh Gouri" / "Gouri Suresh").
 *   4. Each candidate's RMP department is compared with the section's subjects AFTER mapping the department to
 *      subject codes (server/rmp/departments.ts): agree / neutral / conflict.
 *   5. If any candidate agrees, only agreeing candidates are kept. The kept candidates must describe ONE person
 *      (mutually matching names; compatible departments when none agrees), else → review. The pick is the one
 *      with the most ratings (then the stronger name match, then the lower legacyId).
 *   6. The pick is accepted when its department agrees; when neutral, with an exact first + last name, or a
 *      medium match (nickname, surname subset, swap) when the section's subjects are known; when it conflicts,
 *      only with an exact first + last name. Otherwise → review (e.g. API Christopher Alexander in CHE vs RMP
 *      Chris Alexander in Political Science). 'review' shows nothing until a person adds an override.
 */

/** The fields of a roster row the matcher reads (RmpTeacher documents have them). */
export interface RosterTeacher {
  legacyId: number;
  firstName: string;
  lastName: string;
  department: string;
  numRatings: number;
}

export type GivenMatch = "exact" | "nickname" | "partial" | "initial";
export type SurnameMatch = "exact" | "subset";

/** How a roster row's name matches the instructor's. */
export type NameMatchKind =
  | { form: "direct"; given: GivenMatch; surname: SurnameMatch }
  /** RMP first = instructor's last and RMP last = instructor's first. */
  | { form: "swap" }
  /** RMP first + last = the instructor's multi-token surname. */
  | { form: "compound-surname" };

export type MatchStrength = "strong" | "medium" | "weak";

export interface MatchCandidate<T extends RosterTeacher = RosterTeacher> {
  teacher: T;
  kind: NameMatchKind;
  strength: MatchStrength;
  department: DepartmentRelation;
}

export type MatchStatus = "matched" | "unmatched" | "staff" | "review";

export type MatchReason =
  | "staff"
  | "override"
  | "override-no-match"
  | "override-missing"
  | "no-candidate"
  | "name"
  | "ambiguous"
  | "department-conflict"
  | "weak-name";

export interface MatchOutcome<T extends RosterTeacher = RosterTeacher> {
  status: MatchStatus;
  /** The matched roster row (status "matched" only). */
  teacher: T | null;
  reason: MatchReason;
  /** Name-matched candidates that were considered (empty for staff and overrides). */
  candidates: readonly MatchCandidate<T>[];
}

export interface MatchContext {
  /**
   * Subject codes of the instructor's section(s): the subject, then cross-listed siblings' subjects and
   * cross-postings ("ENV", "POL"). Empty = unknown (department never conflicts).
   */
  subjects?: readonly string[];
  /** Override table (default RMP_OVERRIDES). */
  overrides?: readonly RmpOverride[];
}

// ---- Name comparison ---------------------------------------------------------------------------------------------

const isInitial = (token: string) => token.length === 1;

/** Given names (normalised tokens) → how they match, or null. */
export function matchGivenNames(a: readonly string[], b: readonly string[]): GivenMatch | null {
  if (a.length === 0 || b.length === 0) return null;
  if (a.join(" ") === b.join(" ") || a.join("") === b.join("")) return "exact";

  const fullA = a.filter((token) => !isInitial(token));
  const fullB = b.filter((token) => !isInitial(token));
  if (fullA.length > 0 && fullB.length > 0) {
    const headA = fullA[0]!;
    const headB = fullB[0]!;
    const head = headA === headB ? "same" : areNicknames(headA, headB) ? "nickname" : null;
    if (!head) return null;
    // Further full names must agree where both sides have them ("Mary Ann" never matches "Mary Beth").
    const shared = Math.min(fullA.length, fullB.length);
    for (let i = 1; i < shared; i++) if (fullA[i] !== fullB[i]) return null;
    // Middle initials must not contradict ("Mary K" never matches "Mary L").
    const initialsA = a.filter(isInitial);
    const initialsB = b.filter(isInitial);
    if (initialsA.length > 0 && initialsB.length > 0 && initialsA.join("") !== initialsB.join("")) {
      return null;
    }
    return head === "same" ? "partial" : "nickname";
  }

  // One side is initials only ("J", "J R"): its first initial must be the other side's first letter.
  const initialsOnly = fullA.length === 0 ? a : fullB.length === 0 ? b : null;
  const other = initialsOnly === a ? b : a;
  if (initialsOnly && initialsOnly[0] === other[0]![0]) return "initial";
  return null;
}

/** Surnames (normalised tokens) → how they match, or null. */
export function matchSurnames(a: readonly string[], b: readonly string[]): SurnameMatch | null {
  if (a.length === 0 || b.length === 0) return null;
  if (a.join(" ") === b.join(" ") || a.join("") === b.join("")) return "exact";
  const setA = new Set(a);
  const setB = new Set(b);
  const [small, big] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const token of small) if (!big.has(token)) return null;
  const distinctive = [...small].some(
    (token) => token.length >= 2 && !SURNAME_PARTICLES.has(token),
  );
  return distinctive ? "subset" : null;
}

function strengthOf(kind: NameMatchKind): MatchStrength {
  if (kind.form !== "direct") return "medium";
  if (kind.given === "exact" && kind.surname === "exact") return "strong";
  if (kind.given === "initial") return "weak";
  if (kind.given === "exact" || kind.surname === "exact") return "medium";
  return "weak";
}

function sameTokenSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((token, i) => token === sb[i]);
}

interface NameParts {
  given: string[];
  surname: string[];
}

function parts(first: string, last: string): NameParts {
  return { given: nameTokens(first), surname: surnameTokens(last) };
}

function matchParts(
  instructor: NameParts,
  teacher: NameParts,
): { kind: NameMatchKind; strength: MatchStrength } | null {
  const surname = matchSurnames(instructor.surname, teacher.surname);
  const given = surname ? matchGivenNames(instructor.given, teacher.given) : null;
  if (surname && given) {
    const kind: NameMatchKind = { form: "direct", given, surname };
    return { kind, strength: strengthOf(kind) };
  }

  // First/last exchanged: both names must match (exactly or through the nickname table).
  const swappedGiven = matchGivenNames(instructor.given, teacher.surname);
  if (
    (swappedGiven === "exact" || swappedGiven === "nickname") &&
    matchSurnames(instructor.surname, teacher.given) === "exact"
  ) {
    return { kind: { form: "swap" }, strength: "medium" };
  }

  // A compound surname stored as RMP first + last: every token of the RMP name is one of the instructor's
  // surname tokens and vice versa, and the surname has at least two distinctive tokens.
  const distinctive = instructor.surname.filter(
    (token) => token.length >= 2 && !SURNAME_PARTICLES.has(token),
  );
  if (
    distinctive.length >= 2 &&
    sameTokenSet(instructor.surname, [...teacher.given, ...teacher.surname])
  ) {
    return { kind: { form: "compound-surname" }, strength: "medium" };
  }
  return null;
}

/** How a roster row's name matches the instructor's, or null. Department is not considered here. */
export function matchName(
  instructor: Pick<Instructor, "first" | "last">,
  teacher: Pick<RosterTeacher, "firstName" | "lastName">,
): { kind: NameMatchKind; strength: MatchStrength } | null {
  return matchParts(
    parts(instructor.first, instructor.last),
    parts(teacher.firstName, teacher.lastName),
  );
}

/** True when two roster rows could be the same person by name (duplicate RMP profiles). */
function sameName(a: RosterTeacher, b: RosterTeacher): boolean {
  if (a.legacyId === b.legacyId) return true;
  const pa = parts(a.firstName, a.lastName);
  const pb = parts(b.firstName, b.lastName);
  if (sameTokenSet([...pa.given, ...pa.surname], [...pb.given, ...pb.surname])) return true;
  const given = matchGivenNames(pa.given, pb.given);
  return given !== null && given !== "initial" && matchSurnames(pa.surname, pb.surname) !== null;
}

// ---- Overrides -----------------------------------------------------------------------------------------------------

/** The first override for this instructor (and one of `subjects`, when the override is subject-scoped). */
export function findOverride(
  instructor: Pick<Instructor, "first" | "last">,
  subjects: readonly string[],
  overrides: readonly RmpOverride[] = RMP_OVERRIDES,
): RmpOverride | null {
  const first = normalizeName(instructor.first);
  const last = normalizeName(instructor.last);
  return (
    overrides.find(
      (override) =>
        normalizeName(override.instructor.first) === first &&
        normalizeName(override.instructor.last) === last &&
        (!override.subjects || override.subjects.some((subject) => subjects.includes(subject))),
    ) ?? null
  );
}

/** Roster rows an override points at. */
export function overrideTargets<T extends RosterTeacher>(
  target: NonNullable<RmpOverride["rmp"]>,
  roster: readonly T[],
): T[] {
  if ("legacyId" in target) return roster.filter((teacher) => teacher.legacyId === target.legacyId);
  const given = nameTokens(target.firstName).join(" ");
  const surname = surnameTokens(target.lastName);
  return roster.filter(
    (teacher) =>
      nameTokens(teacher.firstName).join(" ") === given &&
      matchSurnames(surnameTokens(teacher.lastName), surname) === "exact",
  );
}

// ---- Decision ------------------------------------------------------------------------------------------------------

const STRENGTH_RANK: Readonly<Record<MatchStrength, number>> = { strong: 0, medium: 1, weak: 2 };

function byPreference<T extends RosterTeacher>(a: MatchCandidate<T>, b: MatchCandidate<T>): number {
  return (
    b.teacher.numRatings - a.teacher.numRatings ||
    STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] ||
    a.teacher.legacyId - b.teacher.legacyId
  );
}

function onePerson<T extends RosterTeacher>(
  candidates: readonly MatchCandidate<T>[],
  checkDepartments: boolean,
): boolean {
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!.teacher;
      const b = candidates[j]!.teacher;
      if (!sameName(a, b)) return false;
      if (checkDepartments && !departmentsCompatible(a.department, b.department)) return false;
    }
  }
  return true;
}

function outcome<T extends RosterTeacher>(
  status: MatchStatus,
  reason: MatchReason,
  candidates: readonly MatchCandidate<T>[] = [],
  teacher: T | null = null,
): MatchOutcome<T> {
  return { status, teacher, reason, candidates };
}

/** Match one catalog instructor against the Davidson roster. */
export function matchInstructor<T extends RosterTeacher>(
  instructor: Instructor,
  roster: readonly T[],
  context: MatchContext = {},
): MatchOutcome<T> {
  if (instructor.isStaff || isStaffName(instructor.first, instructor.last)) {
    return outcome("staff", "staff");
  }
  const subjects = context.subjects ?? [];

  const override = findOverride(instructor, subjects, context.overrides ?? RMP_OVERRIDES);
  if (override) {
    if (override.rmp === null) return outcome("unmatched", "override-no-match");
    const targets = overrideTargets(override.rmp, roster);
    if (targets.length === 1) return outcome("matched", "override", [], targets[0]!);
    return targets.length === 0
      ? outcome("unmatched", "override-missing")
      : outcome("review", "ambiguous");
  }

  const self = parts(instructor.first, instructor.last);
  if (self.surname.length === 0 || self.given.length === 0)
    return outcome("unmatched", "no-candidate");

  const candidates: MatchCandidate<T>[] = [];
  for (const teacher of roster) {
    const match = matchParts(self, parts(teacher.firstName, teacher.lastName));
    if (!match) continue;
    candidates.push({
      teacher,
      ...match,
      department: departmentRelation(teacher.department, subjects),
    });
  }
  if (candidates.length === 0) return outcome("unmatched", "no-candidate");

  const agreeing = candidates.filter((candidate) => candidate.department === "agree");
  const kept = agreeing.length > 0 ? agreeing : candidates;
  if (!onePerson(kept, agreeing.length === 0)) return outcome("review", "ambiguous", candidates);

  const pick = [...kept].sort(byPreference)[0]!;
  switch (pick.department) {
    case "agree":
      return outcome("matched", "name", candidates, pick.teacher);
    case "neutral":
      // Without any subject to check, only an exact first + last name is accepted.
      return pick.strength === "strong" || (pick.strength === "medium" && subjects.length > 0)
        ? outcome("matched", "name", candidates, pick.teacher)
        : outcome("review", "weak-name", candidates);
    case "conflict":
      return pick.strength === "strong"
        ? outcome("matched", "name", candidates, pick.teacher)
        : outcome("review", "department-conflict", candidates);
  }
}
