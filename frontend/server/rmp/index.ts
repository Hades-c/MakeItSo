import "server-only";
import { getFlags } from "@/lib/flags";
import type { Instructor } from "@/lib/types/catalog";
import { type InstructorRating, RmpRatingSchema, type RosterSyncResult } from "@/lib/types/ratings";
import RmpTeacher from "@/models/RmpTeacher";
import { getDb, trusted } from "@/server/db";
import { findOverride, matchInstructor, type MatchOutcome } from "@/server/rmp/match";
import { isStaffName, lookupTokens, normalizeName } from "@/server/rmp/normalize";
import { RMP_OVERRIDES } from "@/server/rmp/overrides";
import { rmpProfileUrl, runRosterSync } from "@/server/rmp/roster";

/**
 * RateMyProfessors service (PLAN §4.1.7, §5 "Ratings (RMP)"; owner W2).
 *
 * - `syncRoster()`: the weekly roster job (server/rmp/roster.ts) behind GET /api/cron/rmp. One GraphQL search for
 *   every Davidson teacher (schoolID U2Nob29sLTM5NjU=, first: 1000, paged by cursor, no Basic header) through
 *   fetchExternal("ratemyprofessors", ...) → rmpteachers, recorded with recordSync("ratemyprofessors", ...).
 * - `getRatings(instructors, { subject, relatedSubjects, homeSubjects })`: reads the stored roster only (no per-view
 *   RMP calls) and runs the matching engine (server/rmp/match.ts) per instructor: never surname-only; departments
 *   mapped to subject codes before a conflict is flagged; conflicts and ambiguity → "review".
 * - RMP_ENABLED=false: every rating is "disabled" and neither function touches the network or the roster.
 *
 * rmpteachers holds no per-user data, so this module registers nothing with server/account/erasers.ts.
 * Course pages use server/rmp/course.ts (distinct instructors of a course + their subjects).
 */

/** The subjects an instructor teaches in the term's other sections (null when that cannot be known). */
export type HomeSubjectsResolver = (instructor: Instructor) => Promise<readonly string[] | null>;

export interface GetRatingsOptions {
  /** Subject code of the section(s) the instructors teach ("CHE"). */
  subject?: string;
  /** Other subjects of those sections: cross-listed siblings' subjects and cross-postings ("POL", "PPE"). */
  relatedSubjects?: readonly string[];
  /**
   * Asked only for an instructor whose sections are listed under interdisciplinary programs alone (WRI, HUM, SIL,
   * ...) when their other sections could settle the match (server/rmp/course.ts catalogHomeSubjects). Without it,
   * such an instructor is matched only by an exact name or an agreeing department, else "review".
   */
  homeSubjects?: HomeSubjectsResolver;
}

interface StoredTeacher {
  legacyId: number;
  firstName: string;
  lastName: string;
  department: string;
  numRatings: number;
  avgRating: number;
  avgDifficulty: number;
  wouldTakeAgainPct: number | null;
  fetchedAt: Date;
}

const TEACHER_FIELDS =
  "legacyId firstName lastName department numRatings avgRating avgDifficulty wouldTakeAgainPct fetchedAt";

function isStaff(instructor: Instructor): boolean {
  return instructor.isStaff || isStaffName(instructor.first, instructor.last);
}

function plainInstructor(instructor: Instructor): Instructor {
  return { first: instructor.first, last: instructor.last, isStaff: instructor.isStaff };
}

/** The roster rows any of `instructors` could match (by surname token), plus override targets. */
async function loadCandidates(
  instructors: readonly Instructor[],
  subjects: readonly string[],
): Promise<StoredTeacher[]> {
  const tokens = new Set<string>();
  const legacyIds = new Set<number>();
  for (const instructor of instructors) {
    for (const token of lookupTokens(instructor.last)) tokens.add(token);
    const target = findOverride(instructor, subjects, RMP_OVERRIDES)?.rmp;
    if (target && "legacyId" in target) legacyIds.add(target.legacyId);
    else if (target) for (const token of lookupTokens(target.lastName)) tokens.add(token);
  }
  if (tokens.size === 0 && legacyIds.size === 0) return [];
  await getDb();
  const clauses: Record<string, unknown>[] = [];
  if (tokens.size > 0) clauses.push({ nameTokens: trusted({ $in: [...tokens] }) });
  if (legacyIds.size > 0) clauses.push({ legacyId: trusted({ $in: [...legacyIds] }) });
  const docs = await RmpTeacher.find(clauses.length === 1 ? clauses[0]! : { $or: clauses })
    .select(TEACHER_FIELDS)
    .lean();
  return docs.map((doc) => ({
    legacyId: doc.legacyId,
    firstName: doc.firstName,
    lastName: doc.lastName,
    department: doc.department ?? "",
    numRatings: doc.numRatings ?? 0,
    avgRating: doc.avgRating ?? 0,
    avgDifficulty: doc.avgDifficulty ?? 0,
    wouldTakeAgainPct: doc.wouldTakeAgainPct ?? null,
    fetchedAt: doc.fetchedAt,
  }));
}

function toRating(instructor: Instructor, outcome: MatchOutcome<StoredTeacher>): InstructorRating {
  const plain = plainInstructor(instructor);
  const teacher = outcome.teacher;
  if (outcome.status !== "matched") return { instructor: plain, status: outcome.status };
  if (!teacher) return { instructor: plain, status: "unmatched" };
  const rmp = RmpRatingSchema.safeParse({
    legacyId: teacher.legacyId,
    avgRating: teacher.avgRating,
    numRatings: teacher.numRatings,
    avgDifficulty: teacher.avgDifficulty,
    wouldTakeAgainPct: teacher.wouldTakeAgainPct,
    department: teacher.department,
    url: rmpProfileUrl(teacher.legacyId),
    asOf: teacher.fetchedAt.toISOString(),
  });
  if (!rmp.success) {
    console.warn(`[rmp] stored teacher ${teacher.legacyId} is invalid; showing no rating`);
    return { instructor: plain, status: "unmatched" };
  }
  return { instructor: plain, status: "matched", rmp: rmp.data };
}

/**
 * One rating per instructor, same order. Staff → "staff"; RMP_ENABLED off → every entry "disabled" (no database
 * or network access). `subject`/`relatedSubjects` are the sections' subjects, used for department agreement;
 * `homeSubjects` is asked only when those are all interdisciplinary programs and the answer could change.
 */
export async function getRatings(
  instructors: readonly Instructor[],
  options: GetRatingsOptions = {},
): Promise<InstructorRating[]> {
  if (!getFlags().rmp) {
    return instructors.map((instructor) => ({
      instructor: plainInstructor(instructor),
      status: "disabled",
    }));
  }
  const subjects = [
    ...new Set(
      [options.subject ?? "", ...(options.relatedSubjects ?? [])]
        .map((subject) => subject.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const lookups = instructors.filter((instructor) => !isStaff(instructor));
  const roster = lookups.length > 0 ? await loadCandidates(lookups, subjects) : [];
  const outcomes = instructors.map((instructor) =>
    matchInstructor(instructor, roster, { subjects }),
  );

  // Second pass for instructors whose sections say nothing about their department (WRI, HUM, ...).
  const resolve = options.homeSubjects;
  if (resolve) {
    const lookedUp = new Map<string, Promise<readonly string[] | null>>();
    await Promise.all(
      outcomes.map(async (outcome, index) => {
        if (!outcome.needsHomeSubjects) return;
        const instructor = instructors[index]!;
        const key = `${normalizeName(instructor.first)}|${normalizeName(instructor.last)}`;
        let pending = lookedUp.get(key);
        if (!pending) lookedUp.set(key, (pending = resolve(plainInstructor(instructor))));
        const homeSubjects = await pending;
        if (homeSubjects) {
          outcomes[index] = matchInstructor(instructor, roster, { subjects, homeSubjects });
        }
      }),
    );
  }
  return instructors.map((instructor, index) => toRating(instructor, outcomes[index]!));
}

/**
 * Pull the whole Davidson roster and replace rmpteachers (keeps the old roster on failure). With RMP_ENABLED off
 * it does nothing: no network, nothing recorded.
 */
export async function syncRoster(): Promise<RosterSyncResult> {
  if (!getFlags().rmp) {
    return {
      ok: false,
      count: 0,
      rejectedOtherSchool: 0,
      error: "RateMyProfessors ratings are turned off (RMP_ENABLED=false).",
    };
  }
  return runRosterSync();
}
