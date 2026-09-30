import type * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatContentDate, formatMonthYear, shortUrl } from "@/app/(hub)/careers/_lib/format";
import { routes } from "@/lib/routes";
import { isLinkedInUrl, type Alumnus } from "@/lib/types/content";
import { cn } from "@/lib/utils";
import { LinkedInIcon } from "./linkedin-icon";

/**
 * One verified alumnus (PLAN §1 "Alumni"): only the stored, sourced fields. A field whose only source is LinkedIn is
 * null in the content and reads "see LinkedIn" here; nothing is ever filled in from anywhere else.
 *
 * - `contactable: false` (public figures, trustees, college officers) is a "Notable alumni" card: a badge, the
 *   reason in words, and no contact affordance (no "Connect", no cold e-mail slot). The LinkedIn profile link stays:
 *   it is where "see LinkedIn" points.
 * - Every card lists its public sources (the LinkedIn profile is not one of them) and its "checked" date.
 * - The card's id is the alumnus id, so /alumni#<id> lands on it.
 */

/** A career path the card names (see _lib/careers.ts careersOf). */
export interface AlumnusCareer {
  slug: string;
  name: string;
}

export interface AlumnusCardProps {
  alumnus: Alumnus;
  /** The career paths to name (resolved from careerPathSlugs); links go to the career pages. */
  careers?: readonly AlumnusCareer[];
  /** Words before the career links (default "Career path"/"Career paths"; a career page says "Also on"). */
  careersLabel?: string;
  /** Say on a Notable alumni card why there is no contact affordance (off where a section heading says it). */
  notableNote?: boolean;
  headingLevel?: "h2" | "h3";
  className?: string;
}

function SeeLinkedIn() {
  return <span className="text-fg-3 italic">see LinkedIn</span>;
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3">
      <dt className="text-fg-3">{term}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

export function AlumnusCard({
  alumnus,
  careers = [],
  careersLabel,
  notableNote = true,
  headingLevel: Heading = "h3",
  className,
}: AlumnusCardProps) {
  const nameId = `alumnus-${alumnus.id}-name`;
  const publicSources = alumnus.sources.filter((url) => !isLinkedInUrl(url));
  const notable = !alumnus.contactable;

  return (
    <article
      id={alumnus.id}
      aria-labelledby={nameId}
      data-alumnus={alumnus.id}
      data-contactable={alumnus.contactable ? "true" : "false"}
      className={cn(
        "flex min-w-0 scroll-mt-24 flex-col rounded-xl border border-line bg-surface p-4 shadow-card target:ring-2 target:ring-focus",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <Heading id={nameId} className="text-base font-strong tracking-title text-fg">
          {alumnus.name}
        </Heading>
        {notable ? <Badge variant="neutral">Notable alumni</Badge> : null}
      </div>

      <dl className="mt-2.5 flex flex-col gap-1 text-sm">
        <Row term="Class of">{alumnus.classYear ?? <SeeLinkedIn />}</Row>
        <Row term="Major">{alumnus.majors ? alumnus.majors.join(", ") : <SeeLinkedIn />}</Row>
        <Row term="Role">{alumnus.role ?? <SeeLinkedIn />}</Row>
        <Row term="Organization">{alumnus.organization ?? <SeeLinkedIn />}</Row>
      </dl>
      {alumnus.roleAsOf ? (
        <p className="mt-1 text-xs text-fg-3">
          {alumnus.role === null
            ? "Organization"
            : alumnus.organization === null
              ? "Role"
              : "Role and organization"}{" "}
          as of <time dateTime={alumnus.roleAsOf}>{formatMonthYear(alumnus.roleAsOf)}</time>
        </p>
      ) : null}

      {careers.length > 0 ? (
        <p className="mt-2.5 text-sm text-fg-2">
          {careersLabel ?? (careers.length > 1 ? "Career paths" : "Career path")}:{" "}
          {careers.map((career, index) => (
            <span key={career.slug}>
              {index > 0 ? ", " : null}
              <Link
                href={routes.career(career.slug)}
                className="font-semibold text-primary hover:underline"
              >
                {career.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      {notable && notableNote ? (
        <p className="mt-2.5 text-xs text-fg-3">
          A public figure, trustee or college officer: listed for reference, not for cold outreach.
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-3">
        <a
          href={alumnus.linkedinUrl}
          rel="noopener noreferrer"
          data-contact={alumnus.contactable ? "linkedin" : undefined}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-primary hover:underline md:min-h-8"
        >
          <LinkedInIcon />
          {alumnus.contactable ? "Connect on LinkedIn" : "LinkedIn profile"}
          <span className="sr-only">: {alumnus.name}</span>
        </a>
        {/* Cold e-mail (AI, a later lane after W6): contactable alumni only. Nothing AI renders here yet. */}
      </div>

      <details className="group mt-1 text-xs text-fg-3">
        {/* A flex summary loses its disclosure triangle, so a chevron turns with the open state instead. */}
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-sm font-semibold text-fg-2 md:min-h-8 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          <span>
            Sources ({publicSources.length}) · checked{" "}
            <time dateTime={alumnus.verifiedAt}>{formatContentDate(alumnus.verifiedAt)}</time>
          </span>
        </summary>
        <ul className="flex flex-col pb-1 md:mt-1 md:gap-1">
          {publicSources.map((url) => (
            <li key={url} className="min-w-0">
              {/* 44px tall below 720px (PLAN §7 tap targets). */}
              <a
                href={url}
                rel="noopener noreferrer"
                title={url}
                className="flex min-h-11 min-w-0 items-center text-primary underline underline-offset-2 md:block md:min-h-0"
              >
                <span className="block min-w-0 truncate">{shortUrl(url)}</span>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
