import "server-only";
import type { SourceId } from "@/lib/sources";
import type { Office, PortalLink, Program } from "@/lib/types/content";
import { HANDSHAKE, getLink } from "@/server/content/links";
import { getOffice, PROGRAMS } from "@/server/content/offices";
import type { ClassStanding } from "@/lib/term";
import { audienceIncludes } from "@/server/today/calendar";
import { addDaysToKey } from "@/server/today/time";

/**
 * Today's "Opportunities" (PLAN §3) and quick links. Opportunities are the curated office programs (fellowships,
 * grants, internships programs; server/content/offices.ts) with a published deadline after the Due soon window
 * (those inside it are already in Due soon) and within OPPORTUNITY_HORIZON_DAYS, soonest first, plus the Davidson
 * Handshake entry point (HANDSHAKE tag; no job postings, employers or "apply by" dates of our own, PLAN §5).
 * Pure over curated content.
 */

export const MAX_OPPORTUNITIES = 4;
export const OPPORTUNITY_HORIZON_DAYS = 120;

export interface Opportunity {
  slug: string;
  name: string;
  /** The office that runs it ("Matthews Center for Career Development"). */
  office: string | null;
  /** The next published deadline. */
  deadline: { label: string; date: string };
  amount: string | null;
  /** Who it is for, as the office publishes it. */
  audience: string | null;
  /** The audience certainly includes the student (calendar audienceIncludes); else the panel says who it is for. */
  forYou: boolean;
  source: SourceId;
  url: string;
  verifiedAt: string;
}

export function upcomingOpportunities(
  after: string,
  today: string,
  standing: ClassStanding | null,
  programs: readonly Program[] = PROGRAMS,
  officeOf: (slug: string) => Pick<Office, "name"> | undefined = getOffice,
): Opportunity[] {
  const horizon = addDaysToKey(today, OPPORTUNITY_HORIZON_DAYS);
  return programs
    .flatMap((program) => {
      const next = program.deadlines
        .filter((deadline) => deadline.date > after && deadline.date <= horizon)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!next) return [];
      return [
        {
          slug: program.slug,
          name: program.name,
          office: officeOf(program.officeSlug)?.name ?? null,
          deadline: { label: next.label, date: next.date },
          amount: program.amount,
          audience: program.audience,
          forYou: audienceIncludes(program.audience, standing),
          source: program.source,
          url: program.url,
          verifiedAt: program.verifiedAt,
        } satisfies Opportunity,
      ];
    })
    .sort((a, b) => a.deadline.date.localeCompare(b.deadline.date) || a.name.localeCompare(b.name))
    .slice(0, MAX_OPPORTUNITIES);
}

/** The Davidson Handshake entry point (the only Handshake URL MakeItSo builds: no constructed searches). */
export function handshakeLink(): { url: string; verifiedAt: string } {
  return { url: HANDSHAKE.baseUrl, verifiedAt: HANDSHAKE.verifiedAt };
}

/** The quick links, in order: the portals and tools a student opens most during a term. */
export const QUICK_LINK_SLUGS = [
  "davidson-one",
  "webtree",
  "banner-self-service",
  "degree-works",
  "handshake",
  "email",
  "library-hours",
  "dining-hours",
] as const;

export function quickLinks(
  lookup: (slug: string) => PortalLink | undefined = getLink,
): PortalLink[] {
  return QUICK_LINK_SLUGS.flatMap((slug) => {
    const link = lookup(slug);
    return link ? [link] : [];
  });
}
