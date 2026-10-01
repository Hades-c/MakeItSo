import { SOURCES } from "@/lib/sources";
import {
  programSourceForOffice,
  type Office,
  type Program,
  type ProgramSource,
  type ResourceLink,
} from "@/lib/types/content";
import { foldText } from "@/server/content/define";

/**
 * A career's Davidson resources (Career.davidsonResources) joined to the curated offices and their programs
 * (server/content/offices.ts), so the card can show what the office publishes and the truthful tag (PLAN §5
 * "Sources"): MATTHEWS CENTER, HURT HUB PROGRAMS, REGISTRAR or DAVIDSON OFFICES (with the office's own name).
 *
 *   1. A resource whose page is exactly one program's page IS that program: its amount and deadline text are
 *      shown exactly as published, with the program's tag.
 *   2. Otherwise a resource that names a program is that program when exactly one program with that name has its
 *      page on the resource's page, below it or above it ("Dean Rusk Travel Grants" → the Dean Rusk Travel Grants
 *      application page; "Nonprofit Leadership Fellows (Mulliss Center …)" → the one of the five programs on the
 *      Mulliss fellowships page with that name). Names are compared without their "( … )" asides.
 *   3. A page several programs share that names none of them (the Summer Internship Grants list names 22 grants)
 *      is not any single one of them: it keeps its own description and gets the tag of the office whose site it
 *      is on (the office URL or below it).
 *   4. Any other page in davidson.edu/offices-and-services (an office with no curated record, such as the art
 *      galleries) gets the DAVIDSON OFFICES tag: that is the part of davidson.edu the source stands for.
 *   5. What is left has no curated source id (lib/sources.ts; contractRequest for a davidson.edu source). An
 *      academic department's or institute's page on www.davidson.edu is shown untagged with an explicit exemption
 *      ("davidson-web"), so a page kind nobody has vetted fails the tests instead of slipping through untagged.
 * Pure: the offices and programs come in as arguments.
 */

/** Why a resource may carry no SourceTag. Only these are allowed (tests; tests/w9a/e2e.ts expectAllTagged). */
export const UNTAGGED_EXEMPTIONS = ["davidson-web"] as const;
export type UntaggedExemption = (typeof UNTAGGED_EXEMPTIONS)[number];

export interface ResolvedResource {
  name: string;
  url: string;
  description: string;
  /** The curated source tag, or null (no office matches). */
  source: ProgramSource | null;
  /** When `source` is null: why the item may be shown without a tag (null: it may not; the tests fail). */
  untagged: UntaggedExemption | null;
  /** The office's own name next to a DAVIDSON OFFICES tag (null for the offices with a tag of their own). */
  officeName: string | null;
  /** Set when the resource is one program: its published facts, and the page they are published on. */
  program: {
    slug: string;
    /** The program's own name, and whether the resource's name already says it (else the card names it). */
    name: string;
    named: boolean;
    url: string;
    amount: string | null;
    deadlineText: string | null;
    verifiedAt: string;
  } | null;
}

/** Comparable form of a URL: lower-case host, no hash, no query-less trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

/** Normalized `url` is normalized `base` or a page below it (at a path boundary). */
function isAtOrBelow(url: string, base: string): boolean {
  return url === base || url.startsWith(`${base}/`);
}

/** The office whose site `url` is on: the longest office URL equal to it or a path prefix of it. */
export function officeForUrl(url: string, offices: readonly Office[]): Office | null {
  const target = normalizeUrl(url);
  let best: Office | null = null;
  let bestLength = -1;
  for (const office of offices) {
    const base = normalizeUrl(office.url);
    if (isAtOrBelow(target, base) && base.length > bestLength) {
      best = office;
      bestLength = base.length;
    }
  }
  return best;
}

/**
 * A name as compared between resources and programs: accents and case folded, "( … )" asides and punctuation
 * dropped. "Nonprofit Leadership Fellows (Mulliss Center for Civic Engagement)" → "nonprofit leadership fellows".
 */
export function nameKey(name: string): string {
  return foldText(name.replace(/\([^)]*\)/g, " "))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The resource names the program: the same name, or the program's name with words before or after it at a word
 * boundary ("Matthews Center Summer Internship Grants" names "Summer Internship Grants (common application)").
 */
export function namesProgram(resourceName: string, programName: string): boolean {
  const resource = nameKey(resourceName);
  const program = nameKey(programName);
  if (!program) return false;
  return (
    resource === program || resource.startsWith(`${program} `) || resource.endsWith(` ${program}`)
  );
}

/** Rule 2: the one program the resource names whose page is on, below or above the resource's page. */
function programByName(resource: ResourceLink, programs: readonly Program[]): Program | null {
  const target = normalizeUrl(resource.url);
  const named = programs.filter((program) => {
    const page = normalizeUrl(program.url);
    const related = isAtOrBelow(page, target) || isAtOrBelow(target, page);
    return related && namesProgram(resource.name, program.name);
  });
  return named.length === 1 ? named[0]! : null;
}

const OFFICES_SITE = normalizeUrl(SOURCES["davidson-offices"].url ?? "");

/** Rule 5: a page on www.davidson.edu (no curated source id covers it yet). */
function isDavidsonWebPage(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === "www.davidson.edu";
  } catch {
    return false;
  }
}

export function resolveResources(
  resources: readonly ResourceLink[],
  offices: readonly Office[],
  programs: readonly Program[],
): ResolvedResource[] {
  const byUrl = new Map<string, Program[]>();
  for (const program of programs) {
    const key = normalizeUrl(program.url);
    byUrl.set(key, [...(byUrl.get(key) ?? []), program]);
  }
  const officeName = (slug: string) => offices.find((office) => office.slug === slug)?.name ?? null;

  return resources.map((resource): ResolvedResource => {
    const base = { name: resource.name, url: resource.url, description: resource.description };
    const sameUrl = byUrl.get(normalizeUrl(resource.url)) ?? [];
    const program =
      (sameUrl.length === 1 ? sameUrl[0]! : null) ?? programByName(resource, programs);
    if (program) {
      return {
        ...base,
        source: program.source,
        untagged: null,
        officeName: program.source === "davidson-offices" ? officeName(program.officeSlug) : null,
        program: {
          slug: program.slug,
          name: program.name,
          named: namesProgram(resource.name, program.name),
          url: program.url,
          amount: program.amount,
          deadlineText: program.deadlineText,
          verifiedAt: program.verifiedAt,
        },
      };
    }
    const office = officeForUrl(resource.url, offices);
    if (office) {
      const source = programSourceForOffice(office.slug);
      return {
        ...base,
        source,
        untagged: null,
        officeName: source === "davidson-offices" ? office.name : null,
        program: null,
      };
    }
    if (OFFICES_SITE && isAtOrBelow(normalizeUrl(resource.url), OFFICES_SITE)) {
      return {
        ...base,
        source: "davidson-offices",
        untagged: null,
        officeName: null,
        program: null,
      };
    }
    return {
      ...base,
      source: null,
      untagged: isDavidsonWebPage(resource.url) ? "davidson-web" : null,
      officeName: null,
      program: null,
    };
  });
}
