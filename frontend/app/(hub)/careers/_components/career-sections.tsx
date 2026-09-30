import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { StatNumber } from "@/components/ui/stat-number";
import type { Career, ResourceLink } from "@/lib/types/content";
import { formatContentDate, formatUsd } from "../_lib/format";
import type { ResolvedResource } from "../_lib/resources";
import { CopyTextButton } from "./copy-text-button";
import { ExternalLink } from "./external-link";

/**
 * The static parts of a career page (PLAN §3 /careers/[slug]): what the work is, pay (BLS, with its period and
 * source), Davidson resources and office programs (amounts and deadlines exactly as published, with their tags),
 * the Handshake entry point with suggested search words, and outside resources. Presentational server components:
 * the page resolves everything and passes it in.
 */

export function WhatYouDoCard({ career }: { career: Career }) {
  return (
    <SectionCard id="what-you-do" title="What you’d do">
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base text-fg">
        {career.whatYouDo.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** BLS pay: median with its period, projected growth, and the Occupational Outlook Handbook page it comes from. */
export function PayCard({ pay }: { pay: Career["pay"] }) {
  return (
    <SectionCard id="pay" title="Pay and outlook">
      {pay ? (
        <div data-testid="career-pay">
          <StatNumber
            value={formatUsd(pay.medianAnnual)}
            label={`median pay per year (${pay.period})`}
          />
          <p className="mt-2 text-sm text-fg-2">{pay.occupation}</p>
          <p className="mt-2 text-sm text-fg">
            <span className="font-semibold">Projected growth:</span> {pay.projectedGrowth}
          </p>
          <p className="mt-3 text-sm">
            <ExternalLink href={pay.url}>Source: BLS Occupational Outlook Handbook</ExternalLink>
          </p>
        </div>
      ) : (
        <p className="text-sm text-fg-2">No federal pay data is published for this path.</p>
      )}
    </SectionCard>
  );
}

function ResourceFacts({ program }: { program: NonNullable<ResolvedResource["program"]> }) {
  if (program.amount === null && program.deadlineText === null) return null;
  return (
    <dl className="mt-2 flex flex-col gap-1 text-sm">
      {program.amount !== null ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-fg">Amount</dt>
          <dd className="text-fg-2">{program.amount}</dd>
        </div>
      ) : null}
      {program.deadlineText !== null ? (
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold text-fg">Deadlines</dt>
          <dd className="text-fg-2">{program.deadlineText}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/**
 * Davidson resources: each with the truthful tag of the office whose page it is (MATTHEWS CENTER, HURT HUB
 * PROGRAMS, DAVIDSON OFFICES + the office's name), and a program's amount and deadlines exactly as published.
 */
export function DavidsonResourcesCard({
  resources,
  verifiedAt,
}: {
  resources: readonly ResolvedResource[];
  verifiedAt: string;
}) {
  return (
    <SectionCard id="davidson-resources" title="At Davidson">
      <ul className="flex flex-col divide-y divide-line">
        {resources.map((resource) => (
          <li
            key={resource.url + resource.name}
            className="py-3 first:pt-0 last:pb-0"
            data-aggregated={resource.source ?? undefined}
            data-source={resource.source ?? undefined}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <ExternalLink href={resource.url}>{resource.name}</ExternalLink>
              {resource.source ? <SourceTag source={resource.source} /> : null}
              {resource.officeName ? (
                <span className="text-xs text-fg-3">{resource.officeName}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-fg-2">{resource.description}</p>
            {resource.program ? <ResourceFacts program={resource.program} /> : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-fg-3">
        Amounts and deadlines as each office publishes them · checked{" "}
        <time dateTime={verifiedAt}>{formatContentDate(verifiedAt)}</time>. Confirm on the office’s
        page before you apply.
      </p>
    </SectionCard>
  );
}

/**
 * Handshake (a link-only source): the Davidson Handshake site and the words to search for there. Handshake
 * documents no keyword-search URL, so none is built (server/content/links.ts handshakeUrl).
 */
export function HandshakeCard({ baseUrl, query }: { baseUrl: string; query: string }) {
  return (
    <SectionCard id="handshake" title="Jobs and internships">
      <div data-aggregated="handshake" data-source="handshake">
        <div className="flex flex-wrap items-center gap-2">
          <SourceTag source="handshake" />
          <span className="text-sm text-fg-2">Davidson’s job and internship site</span>
        </div>
        <p className="mt-3 text-sm text-fg-2">Search Handshake for:</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <code
            className="rounded-sm bg-surface-2 px-2 py-1 font-mono text-sm text-fg"
            data-testid="handshake-query"
          >
            {query}
          </code>
          <CopyTextButton text={query} what="search words" />
        </div>
        <Button asChild variant="secondary" className="mt-4">
          <a href={baseUrl} rel="noopener noreferrer">
            <Search aria-hidden />
            Open Handshake
          </a>
        </Button>
        <p className="mt-2 text-xs text-fg-3">
          Sign in with your Davidson account, then paste the words into Handshake’s search.
        </p>
      </div>
    </SectionCard>
  );
}

export function ExternalResourcesCard({ resources }: { resources: readonly ResourceLink[] }) {
  if (resources.length === 0) return null;
  return (
    <SectionCard id="external-resources" title="Beyond Davidson">
      <ul className="flex flex-col divide-y divide-line">
        {resources.map((resource) => (
          <li key={resource.url + resource.name} className="py-3 first:pt-0 last:pb-0">
            <ExternalLink href={resource.url}>{resource.name}</ExternalLink>
            <p className="mt-1 text-sm text-fg-2">{resource.description}</p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
