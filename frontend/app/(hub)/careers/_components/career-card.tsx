import type * as React from "react";
import Link from "next/link";
import { SourceTag } from "@/components/ui/source-tag";
import { routes } from "@/lib/routes";
import type { Career } from "@/lib/types/content";
import { formatUsd, occupationName } from "../_lib/format";

/**
 * The card's pay: the BLS median with its period and the BLS occupation it is the median for (often not the
 * career's own name: Investment Banking's figure is for securities, commodities and financial services sales
 * agents), linked to that Occupational Outlook Handbook page. The link sits above the card's whole-card link and
 * is 44px tall below 720px, so a tap near it does not open the career instead.
 */
export function CardPay({ pay }: { pay: NonNullable<Career["pay"]> }) {
  const occupation = occupationName(pay.occupation);
  return (
    <div className="flex flex-col gap-0.5 text-sm" data-testid="career-card-pay">
      <p className="text-fg">
        <span className="font-semibold tabular-nums">{formatUsd(pay.medianAnnual)}</span> median pay
        ({pay.period})
      </p>
      <p className="text-fg-2" data-testid="career-card-occupation">
        BLS occupation: {occupation} ·{" "}
        {/* aria-label, not visually hidden text: the link is a flex box, where browsers add a space between its
            children ("Source : …"). It starts with the visible word (WCAG 2.5.3). */}
        <a
          href={pay.url}
          rel="noopener noreferrer"
          aria-label={`Source: BLS Occupational Outlook Handbook, ${occupation}`}
          className="relative z-10 inline-flex min-h-11 min-w-11 items-center rounded-sm font-semibold text-primary hover:underline md:min-h-0 md:min-w-0"
        >
          Source
        </a>
      </p>
    </div>
  );
}

/**
 * One career on /careers: name (the card's link), summary, BLS median pay with its period and occupation (linked
 * to the OOH page), and a slot for the number of its courses on the registration term's schedule (streamed in;
 * empty when the catalog cannot answer). The whole card is the link's target area; the BLS link stays its own link.
 */
export function CareerCard({
  career,
  offered,
}: {
  career: Career;
  /** The "5 of 8 courses on the Spring 2027 schedule" line (or nothing). */
  offered?: React.ReactNode;
}) {
  const titleId = `career-${career.slug}-title`;
  return (
    <article
      aria-labelledby={titleId}
      data-career={career.slug}
      className="relative flex h-full min-w-0 flex-col rounded-xl border border-line bg-surface p-4 shadow-card transition-colors focus-within:border-line-strong hover:border-line-strong md:px-5"
    >
      <h3 id={titleId} className="text-lg font-strong tracking-title text-fg">
        <Link
          href={routes.career(career.slug)}
          className="rounded-sm after:absolute after:inset-0 after:rounded-xl hover:underline"
        >
          {career.name}
        </Link>
      </h3>
      <p className="mt-1.5 line-clamp-4 text-sm text-fg-2">{career.summary}</p>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        {career.pay ? <CardPay pay={career.pay} /> : null}
        {offered}
      </div>
    </article>
  );
}

/** The registration-schedule line of a card. */
export function OfferedLine({
  offered,
  total,
  termLabel,
}: {
  offered: number;
  total: number;
  termLabel: string;
}) {
  return (
    <p
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-2"
      data-aggregated="course-schedule"
      data-source="course-schedule"
      data-testid="career-card-offered"
    >
      <span>
        <span className="font-semibold text-fg tabular-nums">
          {offered} of {total}
        </span>{" "}
        {total === 1 ? "course" : "courses"} offered in {termLabel}
      </span>
      <SourceTag source="course-schedule" />
    </p>
  );
}
