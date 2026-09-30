import "server-only";
import type { ProgramOfferingKind } from "@/lib/types/catalog";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/types/common";
import { cleanText, htmlToText, MISSING_COURSE } from "@/server/programs/html";
import { KIND_LABELS, offeringName, programKey } from "@/server/programs/names";
import {
  type AcalogCore,
  type AcalogProgramDetail,
  isInterdisciplinaryMinorType,
} from "@/server/programs/upstream";

/**
 * One Acalog program page (a department or program: "Computer Science", "Classics") → its offerings (majors,
 * minors, interdisciplinary minors) with requirement text and the course codes it mentions. Pure.
 *
 * Acalog structures a page as "cores" (headed sections, possibly nested, some with a course list). Offerings are
 * the cores headed like one ("Major in Computer Science (B.S. Degree)", "Major Requirements (A.B. Degree)",
 * "Chinese Studies Minor", "Interdisciplinary Minor in Latin American Studies"). Rules, in order:
 *   - a wrapper core that is not an offering but contains offerings ("German Studies") is opened up;
 *   - headings that name several majors/minors (Classics: "Major in Classical Languages and Literature",
 *     "Major in Classical Studies" inside one core) split the core into one offering each;
 *   - a track core ("Minor Requirements - Social Science Track", "Major With Engineering Dual Degree (3-2)
 *     Track") joins the page's offering of the same kind, or starts it;
 *   - an offering whose subject is another public program's page (the Greek minor inside Classics, the Applied
 *     Mathematics minor inside Physics) belongs to that page and is left out here; so is a mere pointer (a core
 *     with no requirement words: "Interdisciplinary Minor in Middle East Studies" in Arab Studies);
 *   - a page with no offering heading but one core headed "Requirements" (Dance, Digital Studies) has one offering:
 *     an interdisciplinary minor on "Interdisciplinary Minors" pages, else the kind its text names first;
 *   - sections that follow an offering at the top level ("Notes", "Capstone", the Data Science course lists)
 *     belong to it, up to the next offering or a department-wide section (honors, course catalog lists, numbering
 *     rationale, placement, diversity and language requirements, sections shared by majors and minors).
 * Names are official: "<Kind> in <Subject> (<Degree> Degree)" with Acalog's own subject and degree words; the
 * degree is Acalog's verbatim ("A.B.", "B.S.", "B.A. or B.S.") or null.
 */

export interface ParsedSection {
  heading: string;
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
}

export interface ParseContext {
  /** Names of the catalog's other public program pages (for leaving out offerings that live on them). */
  otherProgramNames: readonly string[];
}

// ---- Headings ----------------------------------------------------------------------------------------------------

type Family = "major" | "minor";

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

/** Top-level sections that belong to the whole page, not to the offering before them. */
const DEPARTMENT_WIDE =
  /\b(?:honou?rs?|rationale|numbering|graduate|cultural diversity|language requirement|foreign language|placement|transfer|teacher|certificate|pre-?medical|pre-?college|categories|portfolios?|ways of knowing|composition requirement|goals?|information|overview|introduction|introductory|learning outcomes|majors|minors)\b|\bmajor and minor\b|\bcourses\s*$/i;

const REQUIREMENT_WORDS = /\b(?:requir\w*|courses?|credits?)\b/i;

/** "(A.B. Degree)" / "(B.A. or B.S. Degree)" / "(Engineering Dual Degree (3-2) Track)" at the end of a heading. */
const TRAILING_PARENS = /\s*\(((?:[^()]|\([^()]*\))*)\)\s*$/;

function tidy(value: string): string {
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

/** A line inside a core that heads one of several offerings ("Minor in Greek"). */
const INLINE_OFFERING_HEADING =
  /^(Interdisciplinary\s+)?(Major|Minor)\s+in\s+([A-Z][^.:;,!?]{1,79})$/;

// ---- Course codes ------------------------------------------------------------------------------------------------

const CODE_IN_TEXT = /\b([A-Z]{2,4})\s?(\d{3})([A-Z]?)\b/g;
/** Upper-case words followed by three digits that are not Davidson course prefixes. */
const NOT_A_PREFIX = new Set([
  "ACT",
  "AND",
  "AP",
  "FOR",
  "GMAT",
  "GPA",
  "IB",
  "LSAT",
  "MCAT",
  "NOTE",
  "OR",
  "ROOM",
  "SAT",
  "TOEFL",
  "US",
  "USA",
]);

/**
 * A page's own subject written as a word ("Economics 202", "Physics 120, 125 or 130") and the course prefix it
 * stands for (learned from the page's structured course lists).
 */
export interface SubjectAlias {
  word: string;
  prefix: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Course codes a text mentions, normalised ("ARB496" → "ARB 496"), in order of first mention. With aliases,
 * "Economics 202 and 203" also yields ECO 202 and ECO 203.
 */
export function courseCodesIn(text: string, aliases: readonly SubjectAlias[] = []): string[] {
  const found: { index: number; code: string }[] = [];
  for (const match of text.matchAll(CODE_IN_TEXT)) {
    const prefix = match[1] ?? "";
    if (NOT_A_PREFIX.has(prefix)) continue;
    found.push({ index: match.index, code: `${prefix} ${match[2] ?? ""}${match[3] ?? ""}` });
  }
  for (const alias of aliases) {
    const head = new RegExp(`\\b${escapeRegExp(alias.word)}\\s+(\\d{3}[A-Z]?)\\b`, "g");
    const tail = /\s*(?:,|\/|&|\bor\b|\band\b)\s*(?:or\s+|and\s+)?(\d{3}[A-Z]?)\b/y;
    for (const match of text.matchAll(head)) {
      found.push({ index: match.index, code: `${alias.prefix} ${match[1] ?? ""}` });
      tail.lastIndex = match.index + match[0].length;
      let next: RegExpExecArray | null;
      while ((next = tail.exec(text))) {
        found.push({ index: next.index, code: `${alias.prefix} ${next[1] ?? ""}` });
      }
    }
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { code: raw } of found.sort((a, b) => a.index - b.index)) {
    const code = normalizeCourseCode(raw);
    if (!COURSE_CODE_PATTERN.test(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/** The course prefix a page's own course lists use most (at least 3 courses), e.g. Economics → ECO. */
export function pagePrefix(cores: readonly AcalogCore[]): string | null {
  const counts = new Map<string, number>();
  const visit = (list: readonly AcalogCore[]) => {
    for (const core of list) {
      for (const course of core.courses) {
        const prefix = /^([A-Z]{2,4})\s?\d{3}/.exec(tidy(course.title))?.[1];
        if (prefix) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
      }
      visit(core.children);
    }
  };
  visit(cores);
  let best: string | null = null;
  let bestCount = 2;
  for (const [prefix, count] of counts) {
    if (count > bestCount) {
      best = prefix;
      bestCount = count;
    }
  }
  return best;
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

/** The text of one core: its description, then its course list ("- BIO 209 - Bioinformatics Programming"). */
function ownSection(core: AcalogCore): ParsedSection | null {
  const courseLines = core.courses
    .filter((course) => isShown(course))
    .map((course) => tidy(course.title))
    .filter((title) => title !== "")
    .map((title) => `- ${title}`);
  const text = [htmlToText(core.description).text, ...courseLines]
    .filter((part) => part !== "")
    .join("\n");
  return text ? { heading: tidy(core.name), text } : null;
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

function isShown(core: Pick<AcalogCore, "status">): boolean {
  return !core.status || (core.status.active && core.status.visible);
}

/** A core (unless `includeOwn` is false) and all its visible descendants, depth first. */
function coreText(core: AcalogCore, includeOwn = true): ParsedSection[] {
  const sections: ParsedSection[] = [];
  if (includeOwn) {
    const own = ownSection(core);
    if (own) sections.push(own);
  }
  for (const child of byOrder(core.children).filter(isShown)) sections.push(...coreText(child));
  return sections;
}

// ---- Offerings ---------------------------------------------------------------------------------------------------

interface Draft {
  kind: ProgramOfferingKind;
  family: Family;
  label: string;
  subject: string;
  degree: string | null;
  sections: ParsedSection[];
  coreId: number;
  /** The heading of the core that started it (not counted as a requirement statement). */
  ownHeading: string;
  /** Lives on another public program page: left out here, but still absorbs the sections that follow it. */
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

/** Top-level cores in order, with wrapper cores ("German Studies" around the German major/minor) opened up. */
function topLevel(
  cores: readonly AcalogCore[],
  pageName: string,
  interdisciplinaryPage: boolean,
): AcalogCore[] {
  const out: AcalogCore[] = [];
  for (const core of byOrder(cores).filter(isShown)) {
    const isOffering = classifyHeading(core.name, pageName, interdisciplinaryPage) !== null;
    if (!isOffering && containsOffering(core, pageName, interdisciplinaryPage)) {
      if (tidy(core.description ?? "") !== "") out.push({ ...core, children: [] });
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
):
  | { subject: string; label: string; kind: ProgramOfferingKind; sections: ParsedSection[] }[]
  | null {
  const own = ownSection(core);
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
    const sections: ParsedSection[] = [];
    if (preamble) sections.push({ heading: own.heading, text: preamble });
    if (body) sections.push({ heading: lines[head.index]?.trim() ?? head.subject, text: body });
    return { subject: head.subject, label, kind, sections };
  });
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
  const aliases = subjectAliases(pageName, pagePrefix(detail.cores));
  const hasHeading = cores.some((core) =>
    classifyHeading(core.name, pageName, interdisciplinaryPage),
  );
  const fallback = hasHeading ? null : fallbackHeading(cores, interdisciplinaryPage);

  const drafts: Draft[] = [];
  let current: Draft[] = [];
  let attaching = false;

  for (const core of cores) {
    const heading =
      fallback?.core === core
        ? fallback.heading
        : classifyHeading(core.name, pageName, interdisciplinaryPage);
    if (heading) {
      const all = coreText(core);
      if (heading.track) {
        const target = drafts.findLast((draft) => draft.kind === heading.kind && !draft.elsewhere);
        if (target) {
          target.sections.push(...all);
          current = [target];
          attaching = true;
          continue;
        }
      }
      const split = heading.track ? null : splitInline(core, heading);
      const parts = split
        ? split.map((part) => ({ ...part, sections: [...part.sections, ...coreText(core, false)] }))
        : [
            {
              subject: heading.subject ?? pageName,
              label: heading.label,
              kind: heading.kind,
              sections: all,
            },
          ];
      current = parts.map((part) => ({
        kind: part.kind,
        family: heading.family,
        label: part.label,
        subject: part.subject,
        degree: heading.family === "major" ? heading.degree : null,
        sections: part.sections,
        coreId: core.id,
        ownHeading: tidy(core.name),
        elsewhere: otherPages.has(programKey(part.subject)),
      }));
      drafts.push(...current);
      attaching = true;
      continue;
    }
    if (!attaching || current.length === 0) continue;
    if (DEPARTMENT_WIDE.test(tidy(core.name))) {
      attaching = false;
      continue;
    }
    const extra = coreText(core);
    for (const draft of current) draft.sections.push(...extra);
  }

  // One offering per official name (a repeated generic heading adds its sections to the first).
  const byName = new Map<string, { draft: Draft; name: string }>();
  for (const draft of drafts) {
    if (draft.elsewhere || isPointer(draft)) continue;
    const name = offeringName(draft.label, draft.subject, draft.degree);
    const existing = byName.get(programKey(name));
    if (existing) existing.draft.sections.push(...draft.sections);
    else byName.set(programKey(name), { draft, name });
  }
  const offerings: ParsedOffering[] = [...byName.values()].map(({ draft, name }) => {
    const sections = dedupeSections(draft.sections);
    const text = sections.map((section) => `${section.heading}\n${section.text}`).join("\n");
    return {
      kind: draft.kind,
      name,
      degree: draft.degree,
      sections,
      courseCodes: courseCodesIn(text, aliases),
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
  };
}

/**
 * An offering heading with no requirement statement under it (sections included) only points elsewhere:
 * "Students should note as well the possibility of … an interdisciplinary minor in Middle East Studies."
 */
function isPointer(draft: Draft): boolean {
  const stated = draft.sections
    .map(
      (section) =>
        `${section.heading === draft.ownHeading ? "" : section.heading}\n${section.text}`,
    )
    .join("\n");
  return !REQUIREMENT_WORDS.test(stated);
}

/** The same section reached twice (a split core's shared children) is kept once. */
function dedupeSections(sections: readonly ParsedSection[]): ParsedSection[] {
  const seen = new Set<string>();
  return sections.filter((section) => {
    const key = `${section.heading}\u0000${section.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The requirement text of an offering as one string: each section's heading line, its text, a blank line. */
export function requirementsTextOf(sections: readonly ParsedSection[]): string {
  return sections.map((section) => `${section.heading}\n${section.text}`).join("\n\n");
}
