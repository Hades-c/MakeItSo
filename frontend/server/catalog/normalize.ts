import "server-only";
import type { TermCode } from "@/lib/term";
import {
  canonicalCourseCode,
  CrossListingSchema,
  MEETING_DAYS,
  REQ_CODES,
  SectionSchema,
  type CrossListing,
  type Enrollment,
  type Instructor,
  type Meeting,
  type MeetingDay,
  type ReqCode,
  type Section,
  type SectionRestrictions,
} from "@/lib/types/catalog";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/types/common";
import { cleanText, parseDescription } from "@/server/catalog/html";
import type { UpstreamListingRef, UpstreamSection } from "@/server/catalog/upstream";

/**
 * Upstream section → Section (PLAN §4.1.2, §5 "Sections"), plus the extra fields W1 stores in catalogsections.
 * Every rule here is verified against the recorded 202201–202602 responses (tests/catalog/normalize.test.ts):
 *
 * - days: upstream numbers 1 = Monday … 5 = Friday (checked against `weekdays` "MWF"/"TR"); 6 = Saturday and
 *   7 (or 0) = Sunday for completeness; unknown numbers fall back to the `weekdays` letters.
 * - times: `start_time`/`end_time` are 24 h "HHMM" wall clock ("0940", "1340"); `class_time` is ignored.
 * - a meeting with no days or no start/end is TBA (262 of them upstream, e.g. every independent study).
 * - type "lecture" → class, "second meeting time" → second (a lab or discussion slot; it counts for conflicts).
 * - instructor "Staff" (last name) → isStaff; upstream order kept.
 * - seats are raw; `openSeats()` is max(0, remaining) and `isOverEnrolled()` flags a negative remaining.
 * - notes: descriptions verbatim (entities decoded) in upstream order; codes parsed into restrictions.
 * - reqCodes: known codes of THIS listing, upstream order; `[]`/missing → null (no data), never [].
 *   Unknown codes (the legacy "SSCI") are dropped.
 * - cross_listings → {crn, courseCode, section} siblings (by CRN); cross_postings → browse tags.
 * - reg_fors: upstream lists, on the class itself, the registration-only listings that exist for it in another
 *   department (CHE 430 A lists crn 20083 "REG FOR CHE 430-A" = BIO 395 A). Those listings are never in the public
 *   data. So the class keeps them as `registrationSections` (stored, see contractRequests), and `regFor` is set
 *   only on a listing that IS a registration section (its CRN is in another listing's reg_fors, or its title
 *   reads "REG FOR XXX 123-A").
 * - credits come from the API (0 for ensembles, lessons and MIL labs; 2 for HUM 103; else 1).
 */

export interface StoredSection extends Section {
  /** Cross-listing canonical code (canonicalCourseCode). */
  canonicalCode: string;
  /** Upstream department name of `subject` ("Computer Science"). */
  subjectName: string;
  /** Raw upstream note codes ("PRQ", "12+", "W"), upstream order. */
  noteCodes: string[];
  /** Hidden registration-only listings for this class (upstream reg_fors). */
  registrationSections: CrossListing[];
  /** Folded search text: codes, titles, instructors, description (see foldForSearch). */
  searchText: string;
}

// ---- Small parsers -----------------------------------------------------------------------------------------------

const DAY_BY_NUMBER: Readonly<Record<string, MeetingDay>> = {
  "1": "M",
  "2": "T",
  "3": "W",
  "4": "R",
  "5": "F",
  "6": "S",
  "7": "U",
  "0": "U",
};
const DAY_ORDER = new Map(MEETING_DAYS.map((day, i) => [day, i]));

function sortDays(days: Iterable<MeetingDay>): MeetingDay[] {
  return [...new Set(days)].sort((a, b) => (DAY_ORDER.get(a) ?? 0) - (DAY_ORDER.get(b) ?? 0));
}

/** Upstream `days` (numbers) → M T W R F S U, falling back to the `weekdays` letters ("MWF"). */
export function parseDays(
  days: readonly (number | string)[] | null | undefined,
  weekdays?: string | null,
): MeetingDay[] {
  const fromNumbers = (days ?? []).map((day) => DAY_BY_NUMBER[String(day).trim()]);
  if (fromNumbers.length > 0 && fromNumbers.every((day) => day !== undefined)) {
    return sortDays(fromNumbers as MeetingDay[]);
  }
  const letters = (weekdays ?? "").toUpperCase().replace(/[^MTWRFSU]/g, "");
  return sortDays(letters.split("") as MeetingDay[]);
}

/** "0940" / "940" / "09:40" → "09:40"; null when missing or not a valid wall-clock time. */
export function parseClock(value: string | null | undefined): string | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function meetingKind(type: string | null | undefined): Meeting["kind"] {
  const value = (type ?? "").toLowerCase();
  if (!value || value === "lecture" || value === "class") return "class";
  if (value.includes("second")) return "second";
  if (value.includes("lab")) return "lab";
  return "other";
}

export function isStaffName(first: string, last: string): boolean {
  return /^(staff|tba)$/i.test(last.trim()) || (first.trim() === "" && last.trim() === "");
}

/** Seats to show: max(0, remaining) (PLAN §5). */
export function openSeats(enrollment: Pick<Enrollment, "remaining">): number {
  return Math.max(0, enrollment.remaining);
}

/** Upstream reports more students than seats ("Over-enrolled"). */
export function isOverEnrolled(enrollment: Pick<Enrollment, "remaining">): boolean {
  return enrollment.remaining < 0;
}

const YEAR_CODE = /^([1-4]{1,4})(\+?)$/;

/**
 * Registration restrictions from note codes (PLAN §5): class-year codes 1, 12, 123, 23, 234, 3, 34, 4 → eligible
 * years (a trailing "+" = only until the first day of class), PRM → permission required, W → closed to students
 * who met the writing (COMP) requirement. They flag, never block. Several year codes → the union of years, lifted
 * on the first day only when every one of them says so.
 */
export function parseRestrictions(codes: readonly string[]): SectionRestrictions {
  const years = new Set<number>();
  let yearCodes = 0;
  let plusCodes = 0;
  let permissionRequired = false;
  let notIfCompMet = false;
  for (const raw of codes) {
    const code = raw.trim().toUpperCase();
    const year = YEAR_CODE.exec(code);
    if (year?.[1]) {
      yearCodes += 1;
      if (year[2] === "+") plusCodes += 1;
      for (const digit of year[1]) years.add(Number(digit));
    } else if (code === "PRM") {
      permissionRequired = true;
    } else if (code === "W") {
      notIfCompMet = true;
    }
  }
  return {
    eligibleYears: yearCodes > 0 ? [...years].sort((a, b) => a - b) : null,
    untilFirstDay: yearCodes > 0 && plusCodes === yearCodes,
    permissionRequired,
    notIfCompMet,
  };
}

const KNOWN_REQ_CODES = new Set<string>(REQ_CODES);

/** Known requirement codes, upstream order, deduplicated; null when there are none (no data ≠ NONE). */
export function parseReqCodes(
  requirements: readonly { code: string }[] | null | undefined,
): ReqCode[] | null {
  const codes = [
    ...new Set(
      (requirements ?? [])
        .map((r) => r.code.trim().toUpperCase())
        .filter((code) => KNOWN_REQ_CODES.has(code)),
    ),
  ] as ReqCode[];
  return codes.length > 0 ? codes : null;
}

function listingRef(ref: UpstreamListingRef): CrossListing | null {
  const parsed = CrossListingSchema.safeParse({
    crn: String(ref.crn),
    courseCode: normalizeCourseCode(`${ref.subject_code} ${ref.course_number}`),
    section: cleanText(ref.section),
  });
  return parsed.success ? parsed.data : null;
}

function listingRefs(
  refs: readonly UpstreamListingRef[] | null | undefined,
  ownCrn: string,
): CrossListing[] {
  const out: CrossListing[] = [];
  const seen = new Set<string>([ownCrn]);
  for (const ref of refs ?? []) {
    const listing = listingRef(ref);
    if (listing && !seen.has(listing.crn)) {
      seen.add(listing.crn);
      out.push(listing);
    }
  }
  return out;
}

/** "REG FOR CHE 430-A" → "CHE 430". */
export function regForFromTitle(title: string): string | null {
  const match = /^REG(?:ISTRATION)?\s+FOR\s+([A-Z]{2,4})\s*(\d{3}[A-Z]?)\b/i.exec(title.trim());
  if (!match) return null;
  const code = normalizeCourseCode(`${match[1]} ${match[2]}`);
  return COURSE_CODE_PATTERN.test(code) ? code : null;
}

/** Zero-width and invisible formatting characters (pasted text, soft hyphens). */
const INVISIBLE = /[­​-‍⁠﻿]/g;
/** Apostrophes in every spelling: ' ‘ ’ ‛ ʼ ′ ` ´ (iOS smart punctuation types ’). */
const APOSTROPHES = /['‘’‛ʼ′`´]/g;
/** Curly and low double quotes → ". */
const DOUBLE_QUOTES = /[“”„″]/g;

/**
 * Search folding, applied alike to haystacks and queries: lower-case, accents removed ("Beyonce" finds "Beyoncé"),
 * invisible characters removed, apostrophes dropped in every spelling ("O’Geen", "O'Geen", "O''Geen" and "ogeen"
 * all fold to "ogeen"; "women’s" to "womens"), curly double quotes straightened, whitespace collapsed.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(INVISIBLE, "")
    .replace(APOSTROPHES, "")
    .replace(DOUBLE_QUOTES, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Query text before parsing: NFKC (fullwidth "Ｃｓｃ　１２１"), invisible characters removed, whitespace collapsed. */
export function cleanQuery(value: string): string {
  return value.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/** Both code spellings: "csc 121 csc121". */
export function codeSearchForms(code: string): string {
  const folded = foldForSearch(code);
  return `${folded} ${folded.replace(/\s+/g, "")}`;
}

function toCredits(value: number | string | null | undefined): number {
  const credits = typeof value === "string" ? Number(value.trim()) : value;
  return typeof credits === "number" && Number.isFinite(credits) && credits >= 0 ? credits : 1;
}

function toInt(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

// ---- Sections ----------------------------------------------------------------------------------------------------

export type NormalizeResult =
  { ok: true; section: StoredSection } | { ok: false; reason: string; crn: string };

/** Normalise one upstream section of `termCode`. Invalid input (no valid code/CRN) → { ok: false }. */
export function normalizeSection(raw: UpstreamSection, termCode: TermCode): NormalizeResult {
  const crn = String(raw.crn).trim();
  const subject = cleanText(raw.subject.code).toUpperCase();
  const number = cleanText(raw.course_number).toUpperCase();
  const courseCode = normalizeCourseCode(`${subject} ${number}`);
  const title = cleanText(raw.course_title) || courseCode;
  const { descriptionText, prerequisitesText } = parseDescription(raw.course_description);

  const instructors: Instructor[] = (raw.instructors ?? []).map((instructor) => {
    const first = cleanText(instructor.first_name);
    const last = cleanText(instructor.last_name);
    return { first, last, isStaff: isStaffName(first, last) };
  });

  const meetings: Meeting[] = (raw.meetings ?? []).map((meeting) => {
    const days = parseDays(meeting.days, meeting.weekdays);
    const start = parseClock(meeting.start_time);
    const end = parseClock(meeting.end_time);
    const building = cleanText(meeting.building?.description) || cleanText(meeting.building?.code);
    const room = cleanText(meeting.room);
    return {
      days,
      start,
      end,
      ...(building ? { building } : {}),
      ...(room ? { room } : {}),
      kind: meetingKind(meeting.type),
      tba: days.length === 0 || start === null || end === null,
    };
  });

  const notes = raw.notes ?? [];
  const noteCodes = notes.map((note) => cleanText(note.code)).filter(Boolean);
  const crossListings = listingRefs(raw.cross_listings, crn);
  const registrationSections = listingRefs(raw.reg_fors, crn);
  const crossPostings = [
    ...new Set(
      (raw.cross_postings ?? [])
        .map((code) => cleanText(code).toUpperCase())
        .filter((code) => /^[A-Z0-9]{2,6}$/.test(code) && code !== subject),
    ),
  ];

  const candidate: Section = {
    crn,
    termCode,
    courseCode,
    subject,
    number,
    section: cleanText(raw.section).toUpperCase(),
    title,
    credits: toCredits(raw.credits),
    instructors,
    meetings,
    enrollment: {
      current: toInt(raw.enrollment?.current),
      max: toInt(raw.enrollment?.max),
      remaining: toInt(raw.enrollment?.remaining),
    },
    reqCodes: parseReqCodes(raw.grad_requirements),
    prerequisitesText,
    descriptionText,
    notes: notes.map((note) => cleanText(note.description)).filter(Boolean),
    restrictions: parseRestrictions(noteCodes),
    crossListings,
    crossPostings,
    regFor: regForFromTitle(title),
  };
  const parsed = SectionSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      crn,
      reason: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }
  const section = parsed.data;
  return {
    ok: true,
    section: {
      ...section,
      canonicalCode: canonicalCourseCode(section.courseCode, section.crossListings),
      subjectName: cleanText(raw.subject.description),
      noteCodes,
      registrationSections,
      searchText: "",
    },
  };
}

/** The search blob of a section (after reg-for links are known). */
export function sectionSearchText(section: StoredSection): string {
  const codes = [
    section.courseCode,
    ...section.crossListings.map((listing) => listing.courseCode),
    ...section.registrationSections.map((listing) => listing.courseCode),
    ...(section.regFor ? [section.regFor] : []),
  ];
  return foldForSearch(
    [
      ...new Set(codes.map(codeSearchForms)),
      section.title,
      ...section.instructors
        .filter((i) => !i.isStaff)
        .map((instructor) => `${instructor.first} ${instructor.last}`),
      section.descriptionText,
    ].join("\n"),
  );
}

/**
 * Term-wide links: a listing whose CRN appears in another listing's reg_fors is a registration section for that
 * class (`regFor`), then every section gets its search text. Mutates and returns the array.
 */
export function linkSections(sections: StoredSection[]): StoredSection[] {
  const regForByCrn = new Map<string, string>();
  for (const section of sections) {
    for (const listing of section.registrationSections) {
      regForByCrn.set(listing.crn, section.courseCode);
    }
  }
  for (const section of sections) {
    const target = regForByCrn.get(section.crn);
    if (target && target !== section.courseCode) section.regFor = target;
    section.searchText = sectionSearchText(section);
  }
  return sections;
}
