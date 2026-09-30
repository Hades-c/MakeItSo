import "server-only";
import type { ClassStanding } from "@/lib/term";
import type { Course, ReqCode } from "@/lib/types/catalog";
import type { Alumnus, Career } from "@/lib/types/content";
import { ACTIVE_PLAN_STATUSES, type PlanItem, type PlanStatus } from "@/lib/types/plan";
import { isCareerSlug } from "@/server/content/careers";
import { requirementName } from "@/server/content/requirements";

/**
 * The per-feature payload allow-list (PLAN §1 "AI", §6.1 W6): the ONLY student and catalog fields that reach a
 * model. Everything a prompt sends is built from these functions (tests check the exact request body).
 *
 * Never sent: the student's name, e-mail address, account id, grades (or anything that implies one: failed,
 * dropped and withdrawn items are left out), free-text bio, notes, consent dates, IP or session data.
 *   - interests: career-path slugs only (unknown slugs dropped);
 *   - majors / minors: official Acalog names only (anything else dropped);
 *   - plan items: exactly { termCode, courseCode, status } for active statuses;
 *   - cold e-mail: the student's name is the literal {{studentName}}, filled in by the browser; the alumnus is
 *     represented only by the fields the directory displays (null fields left out), and only when contactable.
 */

export interface StudentProfilePayload {
  majors: string[];
  minors: string[];
  graduationYear: number;
  standing: ClassStanding;
  interests: string[];
}

export interface ProfileSource {
  majors: readonly string[];
  minors: readonly string[];
  graduationYear: number;
  standing: { standing: ClassStanding };
  interests: readonly string[];
}

export interface OfficialProgramNames {
  majors: readonly string[];
  minors: readonly string[];
}

/** The allow-listed profile: official program names, graduation year, standing, interest slugs. */
export function studentProfilePayload(
  profile: ProfileSource,
  official: OfficialProgramNames,
): StudentProfilePayload {
  const majors = new Set(official.majors);
  const minors = new Set(official.minors);
  return {
    majors: profile.majors.filter((name) => majors.has(name)),
    minors: profile.minors.filter((name) => minors.has(name)),
    graduationYear: profile.graduationYear,
    standing: profile.standing.standing,
    interests: [...new Set(profile.interests.filter((slug) => isCareerSlug(slug)))],
  };
}

export interface PlanItemPayload {
  termCode: string | null;
  courseCode: string;
  status: PlanStatus;
}

const ACTIVE = new Set<string>(ACTIVE_PLAN_STATUSES);

/** Plan items as { termCode, courseCode, status }, active statuses only (no failed/dropped/withdrawn). */
export function studentPlanPayload(items: readonly PlanItem[]): PlanItemPayload[] {
  return items
    .filter((item) => ACTIVE.has(item.status))
    .map((item) => ({ termCode: item.termCode, courseCode: item.courseCode, status: item.status }));
}

export interface RequirementRef {
  code: ReqCode;
  name: string;
}

export function requirementRefs(codes: readonly ReqCode[]): RequirementRef[] {
  return [...new Set(codes)]
    .filter((code) => code !== "NONE")
    .map((code) => ({ code, name: requirementName(code) }));
}

/** Course "About": the official catalog text of a course in a term, nothing else (no sections, people, seats). */
export interface CourseAboutPayload {
  title: string;
  /** Distinct section descriptions (topics courses can differ per section), at most three. */
  descriptions: string[];
  /** Distinct official prerequisite texts (for context only: the output never restates them). */
  prerequisites: string[];
  requirements: RequirementRef[];
}

function distinct(values: readonly (string | null | undefined)[], max: number): string[] {
  const out: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function courseAboutPayload(course: Course): CourseAboutPayload {
  const sections = [...course.sections].sort((a, b) => a.section.localeCompare(b.section));
  return {
    title: course.title,
    descriptions: distinct(
      sections.map((s) => s.descriptionText),
      3,
    ),
    prerequisites: distinct(
      sections.map((s) => s.prerequisitesText),
      3,
    ),
    requirements: requirementRefs(course.reqCodes),
  };
}

/** A contactable alumnus as the directory shows them (null fields left out); null when not contactable. */
export interface AlumnusPayload {
  name: string;
  classYear?: number;
  majors?: string[];
  role?: string;
  organization?: string;
  roleAsOf?: string;
}

export function alumnusPayload(alumnus: Alumnus): AlumnusPayload | null {
  if (!alumnus.contactable) return null;
  return {
    name: alumnus.name,
    ...(alumnus.classYear !== null ? { classYear: alumnus.classYear } : {}),
    ...(alumnus.majors !== null ? { majors: [...alumnus.majors] } : {}),
    ...(alumnus.role !== null ? { role: alumnus.role } : {}),
    ...(alumnus.organization !== null ? { organization: alumnus.organization } : {}),
    ...(alumnus.roleAsOf !== null && (alumnus.role !== null || alumnus.organization !== null)
      ? { roleAsOf: alumnus.roleAsOf }
      : {}),
  };
}

/** A career path's curated, sourced facts (no pay figures: the page shows those with their source). */
export interface CareerPayload {
  slug: string;
  name: string;
  summary: string;
  whatYouDo: string[];
  departments: { code: string; name: string }[];
  relatedPrograms: string[];
  davidsonResources: string[];
}

export function careerPayload(career: Career): CareerPayload {
  return {
    slug: career.slug,
    name: career.name,
    summary: career.summary,
    whatYouDo: [...career.whatYouDo],
    departments: career.departments.map((d) => ({ code: d.code, name: d.name })),
    relatedPrograms: career.relatedPrograms.map((p) => p.name),
    davidsonResources: career.davidsonResources.map((r) => r.name),
  };
}
