import "server-only";
import type { TermCode } from "@/lib/term";
import {
  SectionSchema,
  type Course,
  type CourseLevel,
  type CourseSummary,
  type Section,
} from "@/lib/types/catalog";
import CatalogSection from "@/models/CatalogSection";
import { buildCourse, courseLevel, summarizeCourse } from "@/server/catalog/courses";
import { getTermMeta } from "@/server/catalog/meta";
import { codeSearchForms, foldForSearch, type StoredSection } from "@/server/catalog/normalize";
import { onCatalogReset } from "@/server/catalog/state";
import { getDb } from "@/server/db";

/**
 * The in-process search index of a term (PLAN §6.1 W1: search < 100 ms). Built once per instance from
 * catalogsections and rebuilt when CatalogMeta's content hash for the term changes (another instance refreshed
 * it) or when this instance refreshes the term. Everything a search needs is precomputed: grouped courses, their
 * summaries, folded haystacks, alias codes.
 */

export interface IndexedCourse {
  course: Course;
  summary: CourseSummary;
  code: string;
  subject: string;
  level: CourseLevel | null;
  /** Own code, cross-listed sibling codes, registration-section codes. */
  aliases: ReadonlySet<string>;
  crossPostings: ReadonlySet<string>;
  /** Folded: codes, course + section titles, instructors, descriptions. */
  haystack: string;
  /** Folded: codes, course + section titles, instructors (no descriptions; the ⌘K palette). */
  shortHaystack: string;
  /** Folded course title. */
  foldedTitle: string;
}

export interface TermIndex {
  term: TermCode;
  hash: string | null;
  /** Sorted by code (stable result order). */
  courses: readonly IndexedCourse[];
  byCode: ReadonlyMap<string, IndexedCourse>;
  byCrn: ReadonlyMap<string, Section>;
  /** Subjects with a course in the term (dept-code queries such as "CSC"). */
  subjects: ReadonlySet<string>;
}

const indexes = new Map<TermCode, TermIndex>();
const building = new Map<TermCode, Promise<TermIndex>>();

onCatalogReset(() => {
  indexes.clear();
  building.clear();
});

export function invalidateTermIndex(term: TermCode): void {
  indexes.delete(term);
}

/** A stored row → the Section contract (plus its stored search text). Invalid rows → null. */
export function rowToSection(
  row: Record<string, unknown>,
): { section: Section; searchText: string } | null {
  const restrictions = (row.restrictions ?? {}) as Record<string, unknown>;
  const reqCodes = Array.isArray(row.reqCodes) && row.reqCodes.length > 0 ? row.reqCodes : null;
  const eligibleYears =
    Array.isArray(restrictions.eligibleYears) && restrictions.eligibleYears.length > 0
      ? restrictions.eligibleYears
      : null;
  const parsed = SectionSchema.safeParse({
    crn: row.crn,
    termCode: row.termCode,
    courseCode: row.courseCode,
    subject: row.subject,
    number: row.number,
    section: row.section,
    title: row.title,
    credits: row.credits,
    instructors: row.instructors,
    meetings: row.meetings,
    enrollment: row.enrollment,
    reqCodes,
    prerequisitesText: row.prerequisitesText ?? null,
    descriptionText: row.descriptionText ?? "",
    notes: row.notes ?? [],
    restrictions: {
      eligibleYears,
      untilFirstDay: restrictions.untilFirstDay ?? false,
      permissionRequired: restrictions.permissionRequired ?? false,
      notIfCompMet: restrictions.notIfCompMet ?? false,
    },
    crossListings: row.crossListings ?? [],
    crossPostings: row.crossPostings ?? [],
    regFor: row.regFor ?? null,
  });
  if (!parsed.success) {
    console.error(`[catalog] stored section ${String(row.termCode)}/${String(row.crn)} is invalid`);
    return null;
  }
  return {
    section: parsed.data,
    searchText: typeof row.searchText === "string" ? row.searchText : "",
  };
}

export interface IndexEntry {
  section: Section;
  searchText: string;
  registrationCodes: string[];
}

/** A freshly normalised section → an index entry (the Section fields only, as a stored row reads back). */
export function entryFromStored(stored: StoredSection): IndexEntry {
  return {
    section: SectionSchema.parse(stored),
    searchText: stored.searchText,
    registrationCodes: stored.registrationSections.map((listing) => listing.courseCode),
  };
}

/** Build an index from sections (pure; also used by tests and the performance check). */
export function buildTermIndex(
  term: TermCode,
  entries: readonly IndexEntry[],
  hash: string | null,
): TermIndex {
  const groups = new Map<string, IndexEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.section.courseCode);
    if (group) group.push(entry);
    else groups.set(entry.section.courseCode, [entry]);
  }
  const courses: IndexedCourse[] = [];
  const byCrn = new Map<string, Section>();
  const subjects = new Set<string>();
  for (const [code, group] of groups) {
    const course = buildCourse(group.map((entry) => entry.section));
    const aliases = new Set<string>([code]);
    const crossPostings = new Set<string>();
    const titles = new Set<string>([course.title]);
    const instructors = new Set<string>();
    const searchTexts = new Set<string>();
    for (const { section, searchText, registrationCodes } of group) {
      byCrn.set(section.crn, section);
      for (const listing of section.crossListings) aliases.add(listing.courseCode);
      for (const alias of registrationCodes) aliases.add(alias);
      if (section.regFor) aliases.add(section.regFor);
      for (const posting of section.crossPostings) crossPostings.add(posting);
      titles.add(section.title);
      for (const i of section.instructors) if (!i.isStaff) instructors.add(`${i.first} ${i.last}`);
      searchTexts.add(searchText);
    }
    subjects.add(course.sections[0]?.subject ?? code.split(" ")[0] ?? "");
    const codes = [...aliases].map(codeSearchForms).join(" ");
    const shortHaystack = foldForSearch(
      `${codes}\n${[...titles].join("\n")}\n${[...instructors].join("\n")}`,
    );
    courses.push({
      course,
      summary: summarizeCourse(course),
      code,
      subject: course.sections[0]?.subject ?? "",
      level: courseLevel(course.sections[0]?.number ?? ""),
      aliases,
      crossPostings,
      haystack: `${shortHaystack}\n${[...searchTexts].join("\n")}`,
      shortHaystack,
      foldedTitle: foldForSearch(course.title),
    });
  }
  courses.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return {
    term,
    hash,
    courses,
    byCode: new Map(courses.map((course) => [course.code, course])),
    byCrn,
    subjects,
  };
}

async function loadIndex(term: TermCode, hash: string | null): Promise<TermIndex> {
  await getDb();
  const rows = await CatalogSection.find({ termCode: term }).lean();
  const entries: IndexEntry[] = [];
  for (const row of rows) {
    const record = row as unknown as Record<string, unknown>;
    const mapped = rowToSection(record);
    if (!mapped) continue;
    const registrationCodes = Array.isArray(record.registrationSections)
      ? (record.registrationSections as { courseCode?: unknown }[])
          .map((listing) => listing.courseCode)
          .filter((code): code is string => typeof code === "string")
      : [];
    entries.push({ ...mapped, registrationCodes });
  }
  return buildTermIndex(term, entries, hash);
}

/**
 * The term's index, current with CatalogMeta's content hash (checked through the few-seconds meta memo). An
 * unknown term yields an empty index; callers decide first whether the term must be loaded (refresh.ts).
 */
export async function getTermIndex(term: TermCode): Promise<TermIndex> {
  const meta = await getTermMeta(term);
  const hash = meta?.contentHash ?? null;
  const current = indexes.get(term);
  if (current && current.hash === hash) return current;
  // One build per (term, hash) at a time; concurrent readers share it.
  const key = `${term}:${hash ?? ""}`;
  let pending = building.get(key);
  if (!pending) {
    pending = loadIndex(term, hash);
    building.set(key, pending);
    const settle = () => building.delete(key);
    pending.then(settle, settle);
  }
  const index = await pending;
  indexes.set(term, index);
  return index;
}
