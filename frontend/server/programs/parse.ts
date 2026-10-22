import "server-only";
import type { ProgramOfferingKind } from "@/lib/types/catalog";
import { courseCodesIn, listedCode, type SubjectAlias } from "@/server/programs/codes";
import { cleanText, htmlToText, MISSING_COURSE } from "@/server/programs/html";
import { KIND_LABELS, offeringName, programKey } from "@/server/programs/names";
import {
  type AcalogCore,
  type AcalogProgramDetail,
  isInterdisciplinaryMinorType,
} from "@/server/programs/upstream";

/**
 * One Acalog program page (a department or program: "Computer Science", "Classics") → its offerings (majors,
 * minors, interdisciplinary minors) with requirement text and the course codes it mentions, plus the page's other
 * sections. Pure. Nothing on the page is dropped: every visible core ends up in an offering, in `pageSections`, or
 * both (only empty wrapper headings are left out).
 *
 * Acalog structures a page as "cores" (headed sections, possibly nested, some with a course list and "adhoc" text
 * inside it). Offerings are the cores headed like one ("Major in Computer Science (B.S. Degree)", "Major
 * Requirements (A.B. Degree)", "Chinese Studies Minor", "Interdisciplinary Minor in Latin American Studies"):
 *   - a wrapper core that is not an offering but contains offerings ("German Studies") is opened up;
 *   - headings that name several majors/minors (Classics: "Major in Classical Languages and Literature",
 *     "Major in Classical Studies" inside one core) split the core into one offering each;
 *   - a track core ("Minor Requirements - Social Science Track", "Major With Engineering Dual Degree (3-2)
 *     Track") joins the page's offering of the same kind, heading included, or starts it;
 *   - an offering whose subject is another public program's page (the Greek minor inside Classics, the Applied
 *     Mathematics minor inside Physics) belongs to that page: its text goes to `pageSections` and `elsewhere`; so
 *     does a mere pointer (no requirement words: "Interdisciplinary Minor in Middle East Studies" in Arab Studies);
 *   - a page with no offering heading but one core headed "Requirements" (Dance, Digital Studies) has one offering:
 *     an interdisciplinary minor on "Interdisciplinary Minors" pages, else the kind its text names first.
 * The other top-level cores, in page order:
 *   - department information (honors, course numbering rationale, graduate school, placement, the college-wide
 *     diversity/language requirements, goals and introductions) and the department's course catalog list (headed
 *     "… Courses", mostly one prefix) go to `pageSections`, and so does whatever follows the catalog;
 *   - a core whose heading names majors and/or minors ("Production Requirements for Majors and Minors",
 *     "Electives counting toward the LAS Major and Interdisciplinary Minor") joins every offering of those kinds;
 *     so does a core nested inside an offering of the other kind ("… Methods Courses for the LAS Major" inside
 *     the LAS minor), which also stays where it is;
 *   - any other core joins the offering(s) before it ("Notes", "Capstone", the Data Science course lists), also
 *     past department information when more offerings follow (FMDS "Notes" after its honors section), plus any
 *     other offering whose text refers to its heading (the Hispanic Studies major's "See Hispanic Studies
 *     Humanities Section below");
 *   - a core before the first offering ("Mathematics Requirement" in Physics), or after department information
 *     with no offering after it ("Courses Within Communication Studies", ENV's track course lists), joins the
 *     offerings of the kinds its text names ("… for the Physics major"), else every offering on the page.
 * Names are official: "<Kind> in <Subject> (<Degree> Degree)" with Acalog's own subject and degree words; the
 * degree is Acalog's verbatim ("A.B.", "B.S.", "B.A. or B.S.") or null.
 */

export interface ParsedSection {
  /** The core's heading ("" only if Acalog gives none). */
  heading: string;
  /** Its text; "" for a heading that is itself the statement ("(3) An international Experience in East Asia…"). */
  text: string;
}

export interface ParsedOffering {
  kind: ProgramOfferingKind;
  name: string;
  degree: string | null;
  sections: ParsedSection[];
  courseCodes: string[];
  /** Course links in the text whose course Acalog does not name (rendered as "[course]"). */
  missingCourseRefs: number;
  /** The Acalog core the offering is headed by. */
  acalogCoreId: number;
}

export type Family = "major" | "minor";

/** An offering this page states but another program page owns (Classics' Greek minor, FMDS's Digital Studies). */
export interface ParsedElsewhere {
  family: Family;
  /** programKey of its subject: the owning page's offering has the same family and subject key. */
  subjectKey: string;
  /** What this page calls it ("Minor in Digital Studies"). */
  name: string;
  /** Its requirement text on this page (requirementsTextOf). */
  text: string;
}

export interface ParsedProgram {
  acalogId: number;
  legacyId: number | null;
  name: string;
  code: string;
  programTypes: string[];
  /** Acalog's `modified` stamp of the page. */
  modified: string;
  descriptionText: string;
  offerings: ParsedOffering[];
  /** The page's sections that belong to no offering (see the module comment), in page order. */
  pageSections: ParsedSection[];
  elsewhere: ParsedElsewhere[];
}

export interface ParseContext {
  /** Names of the catalog's other public program pages (for leaving out offerings that live on them). */
  otherProgramNames: readonly string[];
}

// ---- Headings ----------------------------------------------------------------------------------------------------

interface HeadingClass {
  family: Family;
  kind: ProgramOfferingKind;
  label: string;
  /** Null = the page's own subject ("Major Requirements (A.B. Degree)"). */
  subject: string | null;
  degree: string | null;
  track: boolean;
}

/** Headings that mention a major or minor without being one. */
const NOT_AN_OFFERING =
  /\b(?:honou?rs?|goals?|introduction|portfolios?|electives?|courses?|methods?|prospective|related|information|rationale|numbering|structure|overview|counting|prefixed|outcomes|applications?|declar\w*|procedures?|advising|faq)\b/i;

/**
 * Top-level sections about the department rather than any offering's requirements: honors, course numbering,
 * graduate school, placement, the college-wide diversity/language/composition requirements, certificates and
 * pre-professional advice, goals, introductions and overviews, related programs.
 */
const DEPARTMENT_INFO =
  /\b(?:honou?rs?|rationale|numbering|graduate|cultural diversity|language requirements?|foreign language|ways of knowing|composition requirements?|placement|certificate|teacher|pre-?medical|pre-?dental|goals?|learning outcomes|overview|introduction|introductory|prospective|related)\b/i;

const REQUIREMENT_WORDS = /\b(?:requir\w*|courses?|credits?)\b/i;

/** "(A.B. Degree)" / "(B.A. or B.S. Degree)" / "(Engineering Dual Degree (3-2) Track)" at the end of a heading. */
const TRAILING_PARENS = /\s*\(((?:[^()]|\([^()]*\))*)\)\s*$/;

function tidy(value: string | null | undefined): string {
  return cleanText(value);
}

/** Classify a core heading as an offering (or not). */
export function classifyHeading(
  rawName: string,
  pageName: string,
  interdisciplinaryPage: boolean,
): HeadingClass | null {
  let name = tidy(rawName);
  const hasMajor = /\bmajor\b/i.test(name);
  const hasMinor = /\bminor\b/i.test(name);
  if (hasMajor === hasMinor) return null; // neither, or "the Major and Minor"
  if (NOT_AN_OFFERING.test(name)) return null;

  let degree: string | null = null;
  let track = /\btrack\b/i.test(name);
  const parens = TRAILING_PARENS.exec(name);
  if (parens) {
    const inner = tidy(parens[1] ?? "");
    const degreeMatch = /^(.+?)\s+degree$/i.exec(inner);
    if (degreeMatch?.[1] && !/\btrack\b/i.test(inner)) degree = degreeMatch[1];
    else if (/\btrack\b/i.test(inner)) track = true;
    name = name.slice(0, parens.index).trim();
  }
  // "Minor Requirements - Social Science Track" → "Minor Requirements".
  name = name.replace(/\s*[-–—:]\s*[^-–—:]*\btrack\b.*$/i, "").trim();

  const family: Family = hasMajor ? "major" : "minor";
  const interdisciplinary = /\binterdisciplinary\b/i.test(name);
  const kind: ProgramOfferingKind =
    family === "major"
      ? "major"
      : interdisciplinary || interdisciplinaryPage
        ? "interdisciplinary-minor"
        : "minor";
  const label =
    family === "major"
      ? interdisciplinary
        ? "Interdisciplinary Major"
        : KIND_LABELS.major
      : KIND_LABELS[kind];

  if (track) return { family, kind, label, subject: null, degree, track };

  let subject: string | null;
  const generic = /^(?:interdisciplinary\s+)?(?:major|minor)(?:\s+requirements?)?$/i;
  const leading = /^(?:interdisciplinary\s+)?(?:major|minor)\s+in\s+(.+?)(?:\s+requirements?)?$/i;
  const trailing = /^(.+?)\s+(?:interdisciplinary\s+)?(?:major|minor)(?:\s+requirements?)?$/i;
  if (generic.test(name)) subject = null;
  else {
    const match = leading.exec(name) ?? trailing.exec(name);
    if (!match?.[1]) return null;
    subject = tidy(match[1]);
  }
  if (subject !== null && programKey(subject) === programKey(pageName)) subject = null;
  return { family, kind, label, subject, degree, track };
}

/**
 * The families a heading (or, `inflected`, a text) names: "Majors and Minors" → both, "for the LAS Major" →
 * major; a text also counts "majoring"/"minoring" ("Students majoring or minoring in Russian Studies").
 */
export function familiesNamed(text: string, { inflected = false } = {}): Family[] {
  const major = inflected ? /\bmajor(?:s|ing|ed)?\b/i : /\bmajors?\b/i;
  const minor = inflected ? /\bminor(?:s|ing|ed)?\b/i : /\bminors?\b/i;
  const out: Family[] = [];
  if (major.test(text)) out.push("major");
  if (minor.test(text)) out.push("minor");
  return out;
}

/** A line inside a core that heads one of several offerings ("Minor in Greek"). */
const INLINE_OFFERING_HEADING =
  /^(Interdisciplinary\s+)?(Major|Minor)\s+in\s+([A-Z][^.:;,!?]{1,79})$/;

// ---- Course lists and codes --------------------------------------------------------------------------------------

function isShown(core: Pick<AcalogCore, "status">): boolean {
  return !core.status || (core.status.active && core.status.visible);
}

function byOrder(cores: readonly AcalogCore[]): AcalogCore[] {
  return cores
    .map((core, index) => ({ core, index }))
    .sort(
      (a, b) =>
        (a.core.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (b.core.sort_order ?? Number.MAX_SAFE_INTEGER) || a.index - b.index,
    )
    .map(({ core }) => core);
}

/** Visible courses of a core and its visible descendants. */
function coursesUnder(core: AcalogCore): AcalogCore["courses"] {
  return [
    ...core.courses.filter(isShown),
    ...core.children.filter(isShown).flatMap((child) => coursesUnder(child)),
  ];
}

function dominantPrefix(
  courses: AcalogCore["courses"],
  minimum: number,
): { prefix: string; share: number } | null {
  const counts = new Map<string, number>();
  for (const course of courses) {
    const prefix = listedCode(tidy(course.title))?.split(" ")[0];
    if (prefix) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = minimum - 1;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      best = prefix;
      bestCount = count;
    }
  }
  return best && courses.length > 0 ? { prefix: best, share: bestCount / courses.length } : null;
}

/** The course prefix a page's own course lists use most (at least 3 courses), e.g. Economics → ECO. */
export function pagePrefix(cores: readonly AcalogCore[]): string | null {
  return (
    dominantPrefix(
      cores.flatMap((core) => coursesUnder(core)),
      3,
    )?.prefix ?? null
  );
}

/** Share of one prefix above which a "… Courses" list is the department's course catalog (lowest real: 0.68). */
const CATALOG_PREFIX_SHARE = 0.6;
const CATALOG_MIN_COURSES = 5;

/**
 * The prefix of a department course catalog list ("Economics Courses", "Greek Courses", "Courses"): a heading
 * ending in "Courses" over at least five courses, most of them one prefix. Interdisciplinary lists (ENV's track
 * lists, "Literature Courses" in Global Literary Theory, "East Asian Studies Courses") mix prefixes; they state
 * what counts toward an offering and are not catalogs.
 */
function catalogPrefixOf(core: AcalogCore): string | null {
  const heading = tidy(core.name)
    .replace(TRAILING_PARENS, "")
    .replace(/[.:;]+$/, "")
    .trim();
  if (!/(?:^|\s)courses$/i.test(heading)) return null;
  const courses = coursesUnder(core);
  if (courses.length < CATALOG_MIN_COURSES) return null;
  const dominant = dominantPrefix(courses, 1);
  return dominant && dominant.share >= CATALOG_PREFIX_SHARE ? dominant.prefix : null;
}

/** "German Studies" pages write "German 202"; "Economics" pages write "Economics 101". */
function subjectAliases(pageName: string, prefix: string | null): SubjectAlias[] {
  if (!prefix) return [];
  const words = new Set([pageName, pageName.replace(/\s+Studies$/i, "")]);
  return [...words]
    .filter((word) => /^[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+){0,2}$/.test(word))
    .map((word) => ({ word, prefix }));
}

// ---- Sections ----------------------------------------------------------------------------------------------------

/** A section with the identity of the Acalog core (or core part) it came from, for de-duplication. */
interface Piece extends ParsedSection {
  key: string;
}

/**
 * A core's course list as lines ("- BIO 209 - Bioinformatics Programming"), with its adhoc text where Acalog shows
 * it: before or after the course it is attached to, at the end of that course's line ("right"), or after the list
 * when it is attached to no listed course. Adhocs of a hidden course are hidden with it.
 */
function courseLines(core: AcalogCore): string[] {
  const adhocs = core.adhocs
    .map((adhoc) => ({
      text: htmlToText(adhoc.content).text,
      placement: (adhoc.placement ?? "").toLowerCase(),
      courseId: adhoc["course-id"] ?? null,
    }))
    .filter((adhoc) => adhoc.text !== "");
  const listedIds = new Set(core.courses.map((course) => course.id));
  const at = (id: number, placement: string) =>
    adhocs.filter((adhoc) => adhoc.courseId === id && adhoc.placement === placement);
  const lines: string[] = [];
  for (const course of core.courses) {
    if (!isShown(course)) continue;
    const title = tidy(course.title);
    for (const adhoc of at(course.id, "before")) lines.push(adhoc.text);
    const right = at(course.id, "right")
      .map((adhoc) => adhoc.text.replace(/\s*\n\s*/g, " "))
      .join(" ");
    if (title) lines.push(`- ${title}${right ? ` ${right}` : ""}`);
    for (const adhoc of at(course.id, "after")) lines.push(adhoc.text);
  }
  for (const adhoc of adhocs) {
    if (adhoc.courseId === null || !listedIds.has(adhoc.courseId)) lines.push(adhoc.text);
  }
  return lines;
}

/** The section of one core: its description, then its course list; its heading alone when it has neither. */
function ownPiece(core: AcalogCore): Piece | null {
  const heading = tidy(core.name);
  const text = [htmlToText(core.description).text, ...courseLines(core)]
    .filter((part) => part !== "")
    .join("\n");
  if (!heading && !text) return null;
  return { key: String(core.id), heading, text };
}

/** A core (unless `includeOwn` is false) and all its visible descendants, depth first. */
function coreText(core: AcalogCore, includeOwn = true): Piece[] {
  const pieces: Piece[] = [];
  if (includeOwn) {
    const own = ownPiece(core);
    if (own) pieces.push(own);
  }
  for (const child of byOrder(core.children).filter(isShown)) pieces.push(...coreText(child));
  return pieces;
}

/** Descendants whose heading names only the other kind ("… for the LAS Major" inside the LAS minor). */
function otherFamilyDescendants(
  core: AcalogCore,
  family: Family,
): { families: Family[]; pieces: Piece[] }[] {
  const out: { families: Family[]; pieces: Piece[] }[] = [];
  const visit = (parent: AcalogCore) => {
    for (const child of byOrder(parent.children).filter(isShown)) {
      const heading = tidy(child.name);
      const families = familiesNamed(heading);
      if (families.length > 0 && !families.includes(family) && !DEPARTMENT_INFO.test(heading)) {
        out.push({ families, pieces: coreText(child) });
      } else visit(child);
    }
  };
  visit(core);
  return out;
}

// ---- Offerings ---------------------------------------------------------------------------------------------------

interface Attachment {
  /** Position of the top-level core on the page (sections are kept in page order). */
  index: number;
  pieces: Piece[];
}

interface Draft {
  kind: ProgramOfferingKind;
  family: Family;
  label: string;
  subject: string;
  degree: string | null;
  coreId: number;
  index: number;
  /** The heading of the core that started it (not counted as a requirement statement). */
  ownHeading: string;
  /** Its own core (or split part) and descendants. */
  own: Piece[];
  /** Sections that follow it on the page (tracks, notes, lists); with `own`, what decides a pointer. */
  following: Attachment[];
  /** Sections it gets for other reasons (named kinds, references, sections with no offering before them). */
  extra: Attachment[];
  /** Lives on another public program page. */
  elsewhere: boolean;
}

function containsOffering(
  core: AcalogCore,
  pageName: string,
  interdisciplinaryPage: boolean,
): boolean {
  return core.children.some(
    (child) =>
      classifyHeading(child.name, pageName, interdisciplinaryPage) !== null ||
      containsOffering(child, pageName, interdisciplinaryPage),
  );
}

/**
 * Top-level cores in order, with wrapper cores ("German Studies" around the German major/minor) opened up; a
 * wrapper's own description (if any) stays as a core of its own.
 */
function topLevel(
  cores: readonly AcalogCore[],
  pageName: string,
  interdisciplinaryPage: boolean,
): AcalogCore[] {
  const out: AcalogCore[] = [];
  for (const core of byOrder(cores).filter(isShown)) {
    const isOffering = classifyHeading(core.name, pageName, interdisciplinaryPage) !== null;
    if (!isOffering && containsOffering(core, pageName, interdisciplinaryPage)) {
      if (tidy(core.description) !== "") {
        out.push({ ...core, courses: [], adhocs: [], children: [] });
      }
      out.push(...topLevel(core.children, pageName, interdisciplinaryPage));
    } else out.push(core);
  }
  return out;
}

/** The fallback offering of a page without offering headings (see the module comment). */
function fallbackHeading(
  cores: readonly AcalogCore[],
  interdisciplinaryPage: boolean,
): { core: AcalogCore; heading: HeadingClass } | null {
  const core = cores.find((c) =>
    /^(?:interdisciplinary\s+minor\s+)?requirements$/i.test(tidy(c.name)),
  );
  if (!core) return null;
  let family: Family | null = interdisciplinaryPage ? "minor" : null;
  if (!family) {
    const text = coreText(core)
      .map((section) => section.text)
      .join(" ");
    const major = text.search(/\bmajor\b/i);
    const minor = text.search(/\bminor\b/i);
    if (major === -1 && minor === -1) return null;
    family = minor !== -1 && (major === -1 || minor < major) ? "minor" : "major";
  }
  const kind: ProgramOfferingKind =
    family === "major" ? "major" : interdisciplinaryPage ? "interdisciplinary-minor" : "minor";
  return {
    core,
    heading: { family, kind, label: KIND_LABELS[kind], subject: null, degree: null, track: false },
  };
}

/** Split a core whose text heads several offerings of its family (Classics). */
function splitInline(
  core: AcalogCore,
  heading: HeadingClass,
): { subject: string; label: string; kind: ProgramOfferingKind; pieces: Piece[] }[] | null {
  const own = ownPiece(core);
  if (!own) return null;
  const lines = own.text.split("\n");
  const heads: { index: number; subject: string; interdisciplinary: boolean }[] = [];
  lines.forEach((line, index) => {
    const match = INLINE_OFFERING_HEADING.exec(line.trim());
    if (match && match[2]?.toLowerCase() === heading.family && match[3]) {
      heads.push({ index, subject: tidy(match[3]), interdisciplinary: !!match[1] });
    }
  });
  if (heads.length < 2) return null;
  const firstHead = heads[0]?.index ?? 0;
  const preamble = lines.slice(0, firstHead).join("\n").trim();
  return heads.map((head, i) => {
    const end = heads[i + 1]?.index ?? lines.length;
    const body = lines
      .slice(head.index + 1, end)
      .join("\n")
      .trim();
    const kind: ProgramOfferingKind =
      heading.family === "major"
        ? "major"
        : head.interdisciplinary || heading.kind === "interdisciplinary-minor"
          ? "interdisciplinary-minor"
          : "minor";
    const label = heading.family === "major" ? heading.label : KIND_LABELS[kind];
    const pieces: Piece[] = [];
    if (preamble) pieces.push({ key: `${core.id}:preamble`, heading: own.heading, text: preamble });
    if (body) {
      pieces.push({
        key: `${core.id}:${i}`,
        heading: lines[head.index]?.trim() ?? head.subject,
        text: body,
      });
    }
    return { subject: head.subject, label, kind, pieces };
  });
}

// ---- References --------------------------------------------------------------------------------------------------

/** Words a reference to a heading need not repeat ("Hispanic Humanities" ← "Humanities Section below"). */
const REFERENCE_STOPWORDS = new Set([
  "a",
  "additional",
  "an",
  "at",
  "by",
  "course",
  "for",
  "from",
  "general",
  "in",
  "information",
  "list",
  "note",
  "of",
  "on",
  "or",
  "other",
  "requirement",
  "section",
  "the",
  "to",
  "with",
]);

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(text: string): string[] {
  return programKey(text).split(" ").filter(Boolean).map(stem);
}

/** Words that make a line a reference to another section ("See … Section below", "… category"). */
const REFERENCE_WORD = /\b(?:below|see|listed|section|categor(?:y|ies))\b/i;

/**
 * Whether an offering's own text refers to a section by its heading (or one of its sub-headings): a line with a
 * reference word has every distinctive word (at least two; not generic words) of the heading. "Hispanic Humanities" ← "(See
 * Hispanic Studies Humanities Section below"; Africana's "Categories" ← "Two courses: Cultural Production and
 * Expression category". A mere mention ("It is strongly recommended that students study abroad") is not one.
 */
function refersTo(ownText: string, headings: readonly string[]): boolean {
  const wanted = headings
    .map((heading) =>
      tokens(heading).filter((token) => !REFERENCE_STOPWORDS.has(token) && !/^\d+$/.test(token)),
    )
    // One distinctive word ("Theory Courses") is too weak to tell a reference from a mention.
    .filter((list) => list.length >= 2);
  if (wanted.length === 0) return false;
  return ownText.split("\n").some((line) => {
    if (!REFERENCE_WORD.test(line)) return false;
    const have = new Set(tokens(line));
    return wanted.some((list) => list.every((token) => have.has(token)));
  });
}

// ---- The page ----------------------------------------------------------------------------------------------------

type Role =
  | { kind: "info" }
  | { kind: "catalog" }
  | { kind: "named"; families: Family[] }
  | { kind: "positional" };

function roleOf(core: AcalogCore): Role {
  const heading = tidy(core.name);
  if (DEPARTMENT_INFO.test(heading)) return { kind: "info" };
  if (catalogPrefixOf(core)) return { kind: "catalog" };
  const families = familiesNamed(heading);
  if (families.length > 0) return { kind: "named", families };
  return { kind: "positional" };
}

/** Parse one program page (see the module comment). */
export function parseProgramDetail(
  detail: AcalogProgramDetail,
  context: ParseContext,
): ParsedProgram {
  const pageName = tidy(detail.name);
  const programTypes = detail.program_types.map((type) => tidy(type.name)).filter(Boolean);
  const interdisciplinaryPage = isInterdisciplinaryMinorType(programTypes);
  const otherPages = new Set(
    context.otherProgramNames.map(programKey).filter((key) => key !== programKey(pageName)),
  );

  const cores = topLevel(detail.cores, pageName, interdisciplinaryPage);
  const hasHeading = cores.some((core) =>
    classifyHeading(core.name, pageName, interdisciplinaryPage),
  );
  const fallback = hasHeading ? null : fallbackHeading(cores, interdisciplinaryPage);
  const headingOf = (core: AcalogCore) =>
    fallback?.core === core
      ? fallback.heading
      : classifyHeading(core.name, pageName, interdisciplinaryPage);
  const lastOfferingIndex = cores.findLastIndex((core) => headingOf(core) !== null);

  const drafts: Draft[] = [];
  const pageSections: Attachment[] = [];
  /** Sections for every offering of the kinds they name, resolved once all offerings are known. */
  const named: (Attachment & { families: Family[] })[] = [];
  /** Sections with no offering before them (or only department information), resolved at the end. */
  const unanchored: (Attachment & { description: string })[] = [];
  /** Positional sections, for also giving them to other offerings whose text refers to them. */
  const positional: (Attachment & { headings: string[]; to: Draft[] })[] = [];

  let current: Draft[] = [];
  /** Department information (or the catalog) came after the current offering. */
  let pastInfo = false;
  /** The course catalog came after the current offering: what follows is catalog detail. */
  let pastCatalog = false;

  cores.forEach((core, index) => {
    const heading = headingOf(core);
    if (heading) {
      pastInfo = false;
      pastCatalog = false;
      const all = coreText(core);
      if (heading.track) {
        const target = drafts.findLast((draft) => draft.kind === heading.kind && !draft.elsewhere);
        if (target) {
          target.following.push({ index, pieces: all });
          current = [target];
          return;
        }
      }
      const split = heading.track ? null : splitInline(core, heading);
      const parts = split
        ? split.map((part) => ({ ...part, pieces: [...part.pieces, ...coreText(core, false)] }))
        : [
            {
              subject: heading.subject ?? pageName,
              label: heading.label,
              kind: heading.kind,
              pieces: all,
            },
          ];
      current = parts.map((part) => ({
        kind: part.kind,
        family: heading.family,
        label: part.label,
        subject: part.subject,
        degree: heading.family === "major" ? heading.degree : null,
        coreId: core.id,
        index,
        ownHeading: tidy(core.name),
        own: part.pieces,
        following: [],
        extra: [],
        elsewhere: otherPages.has(programKey(part.subject)),
      }));
      drafts.push(...current);
      for (const cross of otherFamilyDescendants(core, heading.family)) {
        named.push({ index, pieces: cross.pieces, families: cross.families });
      }
      return;
    }

    const pieces = coreText(core);
    if (pieces.length === 0) return;
    const role = roleOf(core);
    if (role.kind === "info" || role.kind === "catalog") {
      pageSections.push({ index, pieces });
      if (current.length > 0) pastInfo = true;
      if (role.kind === "catalog") pastCatalog = true;
      return;
    }
    if (role.kind === "named") {
      named.push({ index, pieces, families: role.families });
      return;
    }
    if (pastCatalog) {
      pageSections.push({ index, pieces });
      return;
    }
    if (current.length === 0 || (pastInfo && index > lastOfferingIndex)) {
      unanchored.push({ index, pieces, description: htmlToText(core.description).text });
      return;
    }
    for (const draft of current) draft.following.push({ index, pieces });
    const headings = [core, ...byOrder(core.children).filter(isShown)].map((c) => tidy(c.name));
    positional.push({ index, pieces, headings, to: current });
  });

  // One offering per official name (a repeated generic heading adds its sections to the first). Offerings that
  // belong to other pages, and pointers, keep their text on the page.
  const byName = new Map<string, { draft: Draft; name: string }>();
  const elsewhere: ParsedElsewhere[] = [];
  for (const draft of drafts) {
    const name = offeringName(draft.label, draft.subject, draft.degree);
    const pointer = isPointer(draft);
    if (draft.elsewhere || pointer) {
      const stated = [{ index: draft.index, pieces: draft.own }, ...draft.following];
      pageSections.push(...stated);
      if (draft.elsewhere && !pointer) {
        elsewhere.push({
          family: draft.family,
          subjectKey: programKey(draft.subject),
          name,
          text: requirementsTextOf(ordered(stated)),
        });
      }
      continue;
    }
    const existing = byName.get(programKey(name));
    if (existing) {
      existing.draft.following.push({ index: draft.index, pieces: draft.own }, ...draft.following);
    } else byName.set(programKey(name), { draft, name });
  }
  const real = [...byName.values()].map(({ draft }) => draft);
  const ownText = new Map(real.map((draft) => [draft, requirementsTextOf(draft.own)]));

  for (const item of named) {
    const targets = real.filter((draft) => item.families.includes(draft.family));
    if (targets.length === 0) pageSections.push(item);
    for (const draft of targets) draft.extra.push(item);
  }
  for (const item of unanchored) {
    // "… for the Physics major and Astrophysics minor" → those two; "German Studies majors and minors" → the
    // major by name and every minor; "toward the major" → every major; no kind named → every offering.
    const families = familiesNamed(item.description, { inflected: true });
    const byName = real.filter((draft) => namesOffering(item.description, draft));
    const targets =
      families.length === 0
        ? real
        : real.filter(
            (draft) =>
              byName.includes(draft) ||
              (families.includes(draft.family) &&
                !byName.some((named) => named.family === draft.family)),
          );
    if (targets.length === 0) pageSections.push(item);
    for (const draft of targets) draft.extra.push(item);
  }
  for (const item of positional) {
    // Sections that follow another page's offering or a pointer stay on the page only.
    if (!item.to.some((draft) => real.includes(draft))) continue;
    for (const draft of real) {
      if (item.to.includes(draft)) continue;
      if (refersTo(ownText.get(draft) ?? "", item.headings)) draft.extra.push(item);
    }
  }

  const aliases = subjectAliases(pageName, pagePrefix(detail.cores));
  const departmentPrefix =
    cores
      .map((core) => (roleOf(core).kind === "catalog" ? catalogPrefixOf(core) : null))
      .find((prefix) => prefix !== null) ?? null;
  const listed = new Set(
    detail.cores
      .flatMap((core) => coursesUnder(core))
      .map((course) => listedCode(tidy(course.title)))
      .filter((code): code is string => code !== null),
  );

  const offerings: ParsedOffering[] = [...byName.values()].map(({ draft, name }) => {
    const sections = ordered([
      { index: -1, pieces: draft.own },
      ...draft.following,
      ...draft.extra,
    ]);
    const text = requirementsTextOf(sections);
    return {
      kind: draft.kind,
      name,
      degree: draft.degree,
      sections,
      courseCodes: courseCodesIn(text, { aliases, departmentPrefix, listed }),
      missingCourseRefs: text.split(MISSING_COURSE).length - 1,
      acalogCoreId: draft.coreId,
    };
  });

  return {
    acalogId: detail.id,
    legacyId: detail["legacy-id"] ?? null,
    name: pageName,
    code: tidy(detail.code ?? ""),
    programTypes,
    modified: detail.modified,
    descriptionText: htmlToText(detail.description).text,
    offerings,
    pageSections: ordered(pageSections),
    elsewhere,
  };
}

/** Whether a text names this offering: "the Physics major and Astrophysics minor", "the minor in Astrophysics". */
function namesOffering(text: string, draft: Draft): boolean {
  const key = ` ${programKey(text)} `;
  const subject = programKey(draft.subject);
  const family = draft.family;
  return [
    `${subject} ${family}`,
    `${subject} ${family}s`,
    `${subject} interdisciplinary ${family}`,
    `${family} in ${subject}`,
    `interdisciplinary ${family} in ${subject}`,
  ].some((phrase) => key.includes(` ${phrase} `));
}

/**
 * An offering heading with no requirement statement under it (sections that follow included) only points
 * elsewhere: "Students should note as well the possibility of … an interdisciplinary minor in Middle East Studies."
 */
function isPointer(draft: Draft): boolean {
  const stated = [...draft.own, ...draft.following.flatMap((item) => item.pieces)]
    .map((piece) => `${piece.heading === draft.ownHeading ? "" : piece.heading}\n${piece.text}`)
    .join("\n");
  return !REQUIREMENT_WORDS.test(stated);
}

/** Attachments in page order (stable), each Acalog core (or core part) once. */
function ordered(attachments: readonly Attachment[]): ParsedSection[] {
  const seen = new Set<string>();
  const out: ParsedSection[] = [];
  const sorted = attachments
    .map((item, position) => ({ item, position }))
    .sort((a, b) => a.item.index - b.item.index || a.position - b.position);
  for (const { item } of sorted) {
    for (const piece of item.pieces) {
      if (seen.has(piece.key)) continue;
      seen.add(piece.key);
      out.push({ heading: piece.heading, text: piece.text });
    }
  }
  return out;
}

/**
 * The requirement text of an offering as one string: each section's heading line, then its text, with a blank line
 * between sections (a heading-only section is its heading line).
 */
export function requirementsTextOf(sections: readonly ParsedSection[]): string {
  return sections
    .map((section) => [section.heading, section.text].filter((part) => part !== "").join("\n"))
    .filter((part) => part !== "")
    .join("\n\n");
}
