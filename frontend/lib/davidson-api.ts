// Server-side access to the Davidson College public API (terms + course
// sections), with per-instance caching, request coalescing and stale-on-error.
//
// Rules (registration hotfix):
// - Terms come from /terms?limit=500. The default term for students is the
//   REGISTRATION term: the first non-summer term after the active one.
// - Courses are paginated by offset (limit=1000) until a page has fewer than
//   `limit` rows, capped at 20 pages. The x-next header is never followed.
// - Every upstream call has a 10 s timeout.
// - On upstream failure the last good data is served. An empty result, or one
//   under half the size of the last good result, is never cached as success.

import {
  fallbackTerms,
  parseTermLabel,
  type ResolvedTerms,
  type TermInfo,
} from "@/lib/terms";

const API_BASE = "https://api.davidson.edu/api/public/v2";
const UPSTREAM_TIMEOUT_MS = 10_000;
const PAGE_LIMIT = 1000;
const MAX_PAGES = 20;
const TERMS_TTL_MS = 6 * 60 * 60 * 1000;
const COURSES_TTL_MS = 30 * 60 * 1000;
// After a failed refresh, keep serving the last good copy this long before retrying.
const RETRY_AFTER_FAILURE_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawTerm {
  term_code: string;
  description: string;
  is_active: boolean;
  is_next: boolean;
  is_summer: boolean;
  start_date?: number;
  end_date?: number;
}

interface RawInstructor {
  first_name?: string;
  last_name?: string;
}

interface RawMeeting {
  weekdays?: string;
  class_time?: string;
  building?: { description?: string };
  room?: string;
}

interface RawSection {
  id?: string;
  crn?: number;
  course_number: string;
  course_title?: string;
  course_description?: string;
  credits?: number | string;
  instructors?: RawInstructor[];
  enrollment?: { current?: number; max?: number; remaining?: number };
  grad_requirements?: { code: string; description: string }[];
  meetings?: RawMeeting[];
  section?: string;
  subject: { code: string; description: string };
}

export interface CourseSection {
  section: string;
  crn?: number;
  title: string;
  /** Only set when sections of this course have different titles (topics courses). */
  description?: string;
  instructors: string[];
  schedule: string;
  location: string;
  credits: number;
  enrollment: { current: number; max: number; remaining: number };
}

export interface LiveCourse {
  code: string;
  name: string;
  /** Official catalog description (instructor line removed, entities decoded).
   *  Empty for topics courses whose sections differ (see sectionList[].description). */
  description: string;
  /** Official prerequisites/notes text from the description's Prerequisites block ("" if none). */
  prerequisites: string;
  department: string;
  deptCode: string;
  professor: string;
  instructors: string[];
  sections: number;
  sectionList: CourseSection[];
  enrollment: { current: number; max: number };
  gradRequirements: string[];
  gradRequirementLabels: string[];
  schedule: string;
  location: string;
  /** Credits from the Davidson API (most common value across sections; usually 1). */
  credits: number;
}

export interface TermCourses {
  term: TermInfo;
  courses: LiveCourse[];
  sectionCount: number;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Process-wide cache (globalThis so every route bundle shares one copy)
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiry: number;
  nextAttempt: number;
}

interface DavidsonCache {
  terms?: CacheEntry<ResolvedTerms>;
  termsInflight?: Promise<ResolvedTerms>;
  courses: Map<string, CacheEntry<TermCourses>>;
  coursesInflight: Map<string, Promise<TermCourses>>;
}

declare global {
  // eslint-disable-next-line no-var
  var __davidsonCache: DavidsonCache | undefined;
}

const cache: DavidsonCache =
  globalThis.__davidsonCache ?? (globalThis.__davidsonCache = { courses: new Map(), coursesInflight: new Map() });

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  eacute: "é",
  egrave: "è",
  aacute: "á",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  ouml: "ö",
  uuml: "ü",
  auml: "ä",
  ccedil: "ç",
  middot: "·",
  bull: "•",
};

function decodeOnce(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const n = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Decode HTML entities. The Davidson API sometimes double-encodes text
 * ("major &amp;amp; minor"), so decode until the text stops changing
 * (at most 3 passes). Tags are stripped before this runs, so decoded "<"
 * is plain text.
 */
export function decodeEntities(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

// Keep the target of real links ("Course Descriptions" -> "Course Descriptions
// (https://collegecatalog.davidson.edu/...)") so the text still makes sense
// once tags are stripped. Outlook "safelinks" wrappers and mailto: links keep
// only their text.
function inlineLinkTargets(html: string): string {
  return html.replace(
    /<a\b[^>]*?\bhref\s*=\s*("|')([^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, _q: string, href: string, inner: string) => {
      const url = decodeEntities(href).trim();
      const text = inner.replace(/<[^>]*>/g, "").trim();
      if (!/^https?:\/\//i.test(url) || /safelinks\.protection\.outlook\.com/i.test(url)) return inner;
      if (!text || decodeEntities(text).includes(url)) return url;
      return `${inner} (${url})`;
    }
  );
}

function htmlToLines(html: string): string[] {
  const text = inlineLinkTargets(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim());
}

// The Prerequisites heading comes as "<b>Prerequisites</b>" and sometimes as
// "<b>Prerequisites:</b>" or with the colon after the tag (ECO 319, ECO 396).
const PREREQ_HEADING = /<(?:b|strong)>\s*Prerequisites?\s*:?\s*<\/(?:b|strong)>\s*:?/i;
// Instructor heading variants seen in the live data, typos included
// ("Insructor" on SPA 265, "Faculty" on WRI 202).
const INSTRUCTOR_HEADING = /^(?:instructors?|insructors?|faculty)\s*:?$/i;
const INSTRUCTOR_INLINE = /^(?:instructors?|insructors?|faculty)\s*:\s*[^.]{1,80}$/i;

/**
 * Split the API's course_description HTML into the description proper and the
 * official prerequisites text (the part after the "Prerequisites" heading),
 * dropping the leading "Instructor(s)" block.
 */
export function parseCourseDescription(html: string): { description: string; prerequisites: string } {
  const [bodyHtml, ...rest] = (html || "").split(PREREQ_HEADING);
  const prereqHtml = rest.join(" ");
  let lines = htmlToLines(bodyHtml).filter(Boolean);
  if (lines.length > 0 && INSTRUCTOR_HEADING.test(lines[0])) {
    // "Instructor" heading followed by a line of surnames
    lines = lines.slice(2);
  } else if (lines.length > 0 && INSTRUCTOR_INLINE.test(lines[0])) {
    // "Instructor: A. Name" on one line
    lines = lines.slice(1);
  }
  const description = lines.join(" ").replace(/\s+/g, " ").trim();
  const prerequisites = htmlToLines(prereqHtml).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return { description, prerequisites };
}

function cleanTitle(title: string | undefined): string {
  return decodeEntities(title ?? "").replace(/\s+/g, " ").trim();
}

function instructorName(i: RawInstructor): string {
  return `${i.first_name ?? ""} ${i.last_name ?? ""}`.replace(/\s+/g, " ").trim();
}

function formatSchedule(meetings: RawMeeting[] | undefined): string {
  if (!meetings || meetings.length === 0) return "TBA";
  const parts = meetings
    .map((m) => `${m.weekdays || "TBA"} ${m.class_time || "TBA"}`.trim())
    .filter((p) => p !== "TBA TBA");
  return parts.length > 0 ? Array.from(new Set(parts)).join("; ") : "TBA";
}

function formatLocation(meetings: RawMeeting[] | undefined): string {
  if (!meetings || meetings.length === 0) return "TBA";
  const parts = meetings
    .map((m) => `${m.building?.description ?? ""} ${m.room ?? ""}`.trim())
    .filter(Boolean);
  return parts.length > 0 ? Array.from(new Set(parts)).join("; ") : "TBA";
}

function toCredits(value: number | string | undefined): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 1;
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    const c = counts.get(v)!;
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function normalizeCourseCode(code: string): string {
  const m = /^\s*([A-Za-z]{2,4})\s*-?\s*(\d{3}[A-Za-z]?)\s*$/.exec(code ?? "");
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : (code ?? "").trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Transform: one entry per course code, every section kept in sectionList
// ---------------------------------------------------------------------------

/** Course name used when sections of one code have different titles (topics courses). */
export const TOPICS_PLACEHOLDER = "Topics vary by section";

/** A lab that goes with a lecture section of the same code (e.g. MIL 102 L "Leadership Lab ..."). */
function isCompanionLab(s: RawSection): boolean {
  const title = cleanTitle(s.course_title);
  return /\blab\b/i.test(title) || (/^L\d*$/.test(s.section ?? "") && toCredits(s.credits) === 0);
}

export function transformSections(raw: RawSection[]): LiveCourse[] {
  const byCode = new Map<string, RawSection[]>();
  for (const s of raw) {
    if (!s?.subject?.code || !s.course_number) continue;
    const code = `${s.subject.code} ${s.course_number}`;
    const list = byCode.get(code);
    if (list) list.push(s);
    else byCode.set(code, [s]);
  }

  const courses: LiveCourse[] = [];
  for (const [code, sections] of Array.from(byCode.entries())) {
    // Topics courses (e.g. WRI 101) share one code but sections can have
    // their own titles and descriptions. Use a title only if most sections
    // share it, and keep per-section descriptions only when they differ.
    // Companion lab sections (ROTC "Leadership Lab" L sections, 0-credit
    // labs) do not count, so MIL 102 = lecture A + lab L keeps the lecture title.
    const lectures = sections.filter((s) => !isCompanionLab(s));
    const titleSource = lectures.length > 0 ? lectures : sections;
    const titleCounts = new Map<string, number>();
    for (const s of titleSource) {
      const t = cleanTitle(s.course_title);
      titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
    }
    const titlesVary = titleCounts.size > 1;
    const majorityTitle = Array.from(titleCounts.entries()).find(([, n]) => n > titleSource.length / 2)?.[0];
    const first =
      titleSource.find((s) => cleanTitle(s.course_title) === (majorityTitle ?? cleanTitle(titleSource[0].course_title))) ??
      titleSource[0];
    const parsed = parseCourseDescription(first.course_description ?? "");
    const sectionDescriptions = titlesVary
      ? sections.map((s) => parseCourseDescription(s.course_description ?? "").description)
      : [];
    const descriptionsVary = new Set(sectionDescriptions).size > 1;
    const description = descriptionsVary && !majorityTitle ? "" : parsed.description;
    const prerequisites = parsed.prerequisites;
    const name = titlesVary && !majorityTitle ? TOPICS_PLACEHOLDER : cleanTitle(first.course_title);
    const instructors = Array.from(
      new Set(sections.flatMap((s) => (s.instructors ?? []).map(instructorName)).filter(Boolean))
    );
    const gradReqs = new Map<string, string>();
    for (const s of sections) {
      for (const gr of s.grad_requirements ?? []) {
        if (gr?.code && gr.code !== "NONE") gradReqs.set(gr.code, decodeEntities(gr.description || gr.code));
      }
    }
    const sectionList: CourseSection[] = sections
      .map((s, i) => ({
        section: s.section ?? "",
        crn: s.crn,
        title: cleanTitle(s.course_title) || name,
        ...(descriptionsVary ? { description: sectionDescriptions[i] } : {}),
        instructors: (s.instructors ?? []).map(instructorName).filter(Boolean),
        schedule: formatSchedule(s.meetings),
        location: formatLocation(s.meetings),
        credits: toCredits(s.credits),
        enrollment: {
          current: s.enrollment?.current ?? 0,
          max: s.enrollment?.max ?? 0,
          remaining: s.enrollment?.remaining ?? Math.max(0, (s.enrollment?.max ?? 0) - (s.enrollment?.current ?? 0)),
        },
      }))
      .sort((a, b) => a.section.localeCompare(b.section));

    courses.push({
      code,
      name,
      description,
      prerequisites,
      department: decodeEntities(first.subject.description),
      deptCode: first.subject.code,
      professor: instructors[0] ?? "Staff",
      instructors: instructors.length > 0 ? instructors : ["Staff"],
      sections: sections.length,
      sectionList,
      enrollment: {
        current: sectionList.reduce((n, s) => n + s.enrollment.current, 0),
        max: sectionList.reduce((n, s) => n + s.enrollment.max, 0),
      },
      gradRequirements: Array.from(gradReqs.keys()),
      gradRequirementLabels: Array.from(gradReqs.values()),
      schedule: sectionList[0]?.schedule ?? "TBA",
      location: sectionList[0]?.location ?? "TBA",
      // Lecture credits: MIL 301 is 1 credit even though its lab section is 0.
      credits: mostCommon(titleSource.map((s) => toCredits(s.credits))),
    });
  }
  courses.sort((a, b) => a.code.localeCompare(b.code));
  return courses;
}

// ---------------------------------------------------------------------------
// Upstream fetch
// ---------------------------------------------------------------------------

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store", // responses exceed the 2 MB Next.js data cache limit
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Davidson API ${res.status} for ${url}`);
  return res.json();
}

function toTermInfo(raw: RawTerm): TermInfo | null {
  const parsed = parseTermLabel(raw.description ?? "");
  if (!parsed || !/^\d{6}$/.test(raw.term_code ?? "")) return null;
  return { code: raw.term_code, label: `${parsed.season} ${parsed.year}`, season: parsed.season, year: parsed.year };
}

export function resolveTermsFromList(list: RawTerm[], now: Date = new Date()): ResolvedTerms {
  // Only regular "Fall/Spring/Summer YYYY" terms; skips placeholder rows like
  // "The Beginning of Time" and old "04" summer codes.
  const regular = list
    .map((raw) => ({ raw, info: toTermInfo(raw) }))
    .filter((t): t is { raw: RawTerm; info: TermInfo } => t.info !== null)
    .sort((a, b) => a.info.code.localeCompare(b.info.code));
  const ts = now.getTime();
  const active =
    regular.find((t) => t.raw.is_active) ??
    regular.find((t) => (t.raw.start_date ?? Infinity) <= ts && ts <= (t.raw.end_date ?? -Infinity)) ??
    [...regular].reverse().find((t) => (t.raw.start_date ?? Infinity) <= ts);
  if (!active) throw new Error("No active term in Davidson terms list");
  const registration = regular.find(
    (t) => t.info.code > active.info.code && !t.raw.is_summer && t.info.season !== "Summer"
  );
  if (!registration) throw new Error(`No registration term after ${active.info.code}`);
  return { active: active.info, registration: registration.info, source: "live" };
}

async function loadTerms(): Promise<ResolvedTerms> {
  const data = await fetchJson(`${API_BASE}/terms?limit=500`);
  if (!Array.isArray(data) || data.length === 0) throw new Error("Davidson terms API returned no terms");
  return resolveTermsFromList(data as RawTerm[]);
}

/** Active + registration terms. Never throws: falls back to the last good copy, then to the date. */
export async function getTerms(): Promise<ResolvedTerms> {
  const now = Date.now();
  const entry = cache.terms;
  if (entry && (now < entry.expiry || now < entry.nextAttempt)) {
    return entry.value;
  }
  if (!cache.termsInflight) {
    cache.termsInflight = loadTerms()
      .then((terms) => {
        cache.terms = { value: terms, expiry: Date.now() + TERMS_TTL_MS, nextAttempt: 0 };
        return terms;
      })
      .catch((err) => {
        console.error("Davidson terms fetch failed:", err);
        const last = cache.terms?.value;
        const value: ResolvedTerms =
          last && last.source !== "fallback" ? { ...last, source: "stale" } : fallbackTerms();
        cache.terms = { value, expiry: 0, nextAttempt: Date.now() + RETRY_AFTER_FAILURE_MS };
        return value;
      })
      .finally(() => {
        cache.termsInflight = undefined;
      });
  }
  return cache.termsInflight;
}

async function loadSections(termCode: string): Promise<RawSection[]> {
  const all: RawSection[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_LIMIT;
    const url = `${API_BASE}/courses?limit=${PAGE_LIMIT}&offset=${offset}&term_code=${encodeURIComponent(termCode)}`;
    const data = await fetchJson(url);
    if (!Array.isArray(data)) throw new Error(`Davidson courses API returned ${typeof data} for ${termCode}`);
    for (const row of data as RawSection[]) {
      const key = row?.id ?? `${row?.subject?.code} ${row?.course_number} ${row?.section} ${row?.crn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(row);
    }
    if (data.length < PAGE_LIMIT) break;
    if (page === MAX_PAGES - 1) console.warn(`Davidson courses: stopped at ${MAX_PAGES} pages for ${termCode}`);
  }
  return all;
}

export class CourseDataUnavailableError extends Error {}

/**
 * Course data for one term. Returns fresh data when possible, otherwise the
 * last good copy with `stale: true`. Throws CourseDataUnavailableError only
 * when nothing good has ever been loaded for the term.
 */
export async function getTermCourses(term: TermInfo): Promise<{ data: TermCourses; stale: boolean }> {
  const now = Date.now();
  const entry = cache.courses.get(term.code);
  if (entry && now < entry.expiry) return { data: entry.value, stale: false };
  if (entry && now < entry.nextAttempt) return { data: entry.value, stale: true };

  let inflight = cache.coursesInflight.get(term.code);
  if (!inflight) {
    inflight = (async () => {
      const raw = await loadSections(term.code);
      const last = cache.courses.get(term.code)?.value;
      if (raw.length === 0) throw new Error(`Davidson courses API returned no sections for ${term.code}`);
      if (last && raw.length < last.sectionCount * 0.5) {
        throw new Error(
          `Davidson courses API returned ${raw.length} sections for ${term.code}, under half of the last good ${last.sectionCount}`
        );
      }
      const value: TermCourses = {
        term,
        courses: transformSections(raw),
        sectionCount: raw.length,
        fetchedAt: new Date().toISOString(),
      };
      cache.courses.set(term.code, { value, expiry: Date.now() + COURSES_TTL_MS, nextAttempt: 0 });
      return value;
    })().finally(() => {
      cache.coursesInflight.delete(term.code);
    });
    cache.coursesInflight.set(term.code, inflight);
  }

  try {
    return { data: await inflight, stale: false };
  } catch (err) {
    console.error(`Davidson courses fetch failed for ${term.code}:`, err);
    const last = cache.courses.get(term.code);
    if (last) {
      last.nextAttempt = Date.now() + RETRY_AFTER_FAILURE_MS;
      return { data: last.value, stale: true };
    }
    throw new CourseDataUnavailableError(`Course data for ${term.label} is unavailable`);
  }
}

// ---------------------------------------------------------------------------
// Lookups used by plans and AI grounding
// ---------------------------------------------------------------------------

export interface LiveCatalogEntry {
  code: string;
  name: string;
  department: string;
  credits: number;
  terms: TermInfo[];
}

/**
 * Union of the active and registration term schedules, keyed by course code.
 * Throws CourseDataUnavailableError if neither term could be loaded.
 */
export async function getLiveCatalog(): Promise<{ terms: ResolvedTerms; index: Map<string, LiveCatalogEntry> }> {
  const terms = await getTerms();
  const results = await Promise.allSettled([getTermCourses(terms.registration), getTermCourses(terms.active)]);
  const index = new Map<string, LiveCatalogEntry>();
  let loaded = 0;
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    loaded++;
    const { term, courses } = r.value.data;
    for (const c of courses) {
      const existing = index.get(c.code);
      if (existing) existing.terms.push(term);
      else index.set(c.code, { code: c.code, name: c.name, department: c.department, credits: c.credits, terms: [term] });
    }
  }
  if (loaded === 0) throw new CourseDataUnavailableError("No live Davidson course data is available");
  return { terms, index };
}

/** Find a course in a specific live term (if it is the active or registration term), else in either. */
export async function findLiveCourse(code: string, termCode?: string): Promise<LiveCourse | null> {
  const wanted = normalizeCourseCode(code);
  const terms = await getTerms();
  const order = [terms.registration, terms.active].sort((a, b) =>
    a.code === termCode ? -1 : b.code === termCode ? 1 : 0
  );
  for (const term of order) {
    try {
      const { data } = await getTermCourses(term);
      const hit = data.courses.find((c) => c.code === wanted);
      if (hit) return hit;
    } catch {
      // try the other term
    }
  }
  return null;
}
