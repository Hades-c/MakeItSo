import {
  programSourceForOffice,
  type Office,
  type Program,
  type ProgramSource,
  type ResourceLink,
} from "@/lib/types/content";

/**
 * A career's Davidson resources (Career.davidsonResources) joined to the curated offices and their programs
 * (server/content/offices.ts), so the card can show what the office publishes and the truthful tag (PLAN §5
 * "Sources"): MATTHEWS CENTER, HURT HUB PROGRAMS, REGISTRAR or DAVIDSON OFFICES (with the office's own name).
 *
 *   - A resource whose page is exactly one program's page IS that program: its amount and deadline text are shown
 *     exactly as published, with the program's tag.
 *   - A page several programs share (the Summer Internship Grants list names 22 grants) is not any single one of
 *     them: it keeps its own description and gets the tag of the office whose site it is on.
 *   - A page on an office's site (the office URL or below it) gets that office's tag.
 *   - Anything else (a department page) has no curated source tag: it is shown with the career's "checked" date.
 * Pure: the offices and programs come in as arguments.
 */

export interface ResolvedResource {
  name: string;
  url: string;
  description: string;
  /** The curated source tag, or null (no office matches). */
  source: ProgramSource | null;
  /** The office's own name next to a DAVIDSON OFFICES tag (null for the offices with a tag of their own). */
  officeName: string | null;
  /** Set when the resource is one program's page: its published facts. */
  program: {
    slug: string;
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

/** The office whose site `url` is on: the longest office URL equal to it or a path prefix of it. */
export function officeForUrl(url: string, offices: readonly Office[]): Office | null {
  const target = normalizeUrl(url);
  let best: Office | null = null;
  let bestLength = -1;
  for (const office of offices) {
    const base = normalizeUrl(office.url);
    if ((target === base || target.startsWith(`${base}/`)) && base.length > bestLength) {
      best = office;
      bestLength = base.length;
    }
  }
  return best;
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

  return resources.map((resource) => {
    const matches = byUrl.get(normalizeUrl(resource.url)) ?? [];
    const only = matches.length === 1 ? matches[0]! : null;
    if (only) {
      return {
        name: resource.name,
        url: resource.url,
        description: resource.description,
        source: only.source,
        officeName: only.source === "davidson-offices" ? officeName(only.officeSlug) : null,
        program: {
          slug: only.slug,
          amount: only.amount,
          deadlineText: only.deadlineText,
          verifiedAt: only.verifiedAt,
        },
      };
    }
    const office = officeForUrl(resource.url, offices);
    const source = office ? programSourceForOffice(office.slug) : null;
    return {
      name: resource.name,
      url: resource.url,
      description: resource.description,
      source,
      officeName: office && source === "davidson-offices" ? office.name : null,
      program: null,
    };
  });
}
