import type * as React from "react";
import Link from "next/link";
import { FlaskConical, MessageSquare, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import type { AlumnusCareer } from "@/app/(hub)/alumni/_lib/careers";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { SampleAlumnus } from "@/server/content/alumni-sample";
import { initialsOf } from "../_lib/sample-directory";

/** Why Connect and Message do nothing (shown under them, and read with them). */
export const UNAVAILABLE_REASON = "Available once Davidson Connect is connected";

/**
 * One SAMPLE profile, laid out as a Davidson Connect directory card will be: initials (no photos), name, class year,
 * majors, role, organization, city, industry, career paths and what the person can help with, then Connect and
 * Message. Fictional: the "Sample" badge is on every card (and in the card's accessible name), and Connect and
 * Message are disabled with the reason beside them; nothing sends anything. Never used for a verified alumnus
 * (that is app/(hub)/alumni/_components/alumnus-card.tsx).
 */

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3">
      <dt className="text-fg-3">{term}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

export function SampleAlumnusCard({
  record,
  careers,
  className,
}: {
  record: SampleAlumnus;
  careers: readonly AlumnusCareer[];
  className?: string;
}) {
  const nameId = `${record.id}-name`;
  const badgeId = `${record.id}-sample`;
  const reasonId = `${record.id}-unavailable`;
  const helpId = `${record.id}-help`;
  return (
    <article
      id={record.id}
      aria-labelledby={`${nameId} ${badgeId}`}
      data-sample-alumnus={record.id}
      data-sample="true"
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 shadow-card",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-fg-2"
          data-initials=""
        >
          {initialsOf(record.name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <h3 id={nameId} className="text-base font-strong tracking-title text-fg">
            {record.name}
          </h3>
          <Badge id={badgeId} variant="warning" data-testid="sample-badge">
            <FlaskConical aria-hidden />
            Sample
          </Badge>
        </div>
      </div>

      <dl className="mt-3 flex flex-col gap-1 text-sm">
        <Row term="Class of">{record.classYear}</Row>
        <Row term={record.majors.length > 1 ? "Majors" : "Major"}>{record.majors.join(", ")}</Row>
        <Row term="Role">{record.role}</Row>
        <Row term="Organization">{record.organization}</Row>
        <Row term="Location">{record.location}</Row>
        <Row term="Industry">{record.industry}</Row>
      </dl>

      {careers.length > 0 ? (
        <p className="mt-2.5 text-sm text-fg-2">
          {careers.length > 1 ? "Career paths" : "Career path"}:{" "}
          {careers.map((career, index) => (
            <span key={career.slug}>
              {index > 0 ? ", " : null}
              <Link href={routes.career(career.slug)} className="font-semibold link">
                {career.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      <div className="mt-2.5">
        <p id={helpId} className="text-sm text-fg-2">
          Can help with
        </p>
        <ul className="mt-1 flex flex-wrap gap-1.5" aria-labelledby={helpId}>
          {record.canHelpWith.map((topic) => (
            <li key={topic}>
              <Chip variant="neutral">{topic}</Chip>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto pt-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled aria-describedby={reasonId}>
            <UserPlus aria-hidden />
            Connect
          </Button>
          <Button variant="secondary" size="sm" disabled aria-describedby={reasonId}>
            <MessageSquare aria-hidden />
            Message
          </Button>
        </div>
        <p id={reasonId} className="mt-1.5 text-xs text-fg-3">
          {UNAVAILABLE_REASON}
        </p>
      </div>
    </article>
  );
}
