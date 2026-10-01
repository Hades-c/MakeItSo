import { BriefcaseBusiness, ExternalLink } from "lucide-react";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { formatShortDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  dueSoonRange,
  etDay,
  handshakeLink,
  loadProfile,
  safely,
  standingOf,
  upcomingOpportunities,
} from "@/server/today";
import { STRETCHED_LINK } from "../_lib/styles";
import { PanelError } from "./panel-states";

function shortDay(day: string): string {
  return formatShortDate(new Date(`${day}T12:00:00Z`), "UTC");
}

/**
 * Opportunities (PLAN §3): curated office programs (fellowships, grants, funded internships) whose next published
 * deadline comes after the Due soon window, with the office that runs them, that deadline and, when the published
 * audience does not certainly include the student, who it is for; plus the Davidson
 * Handshake entry point for jobs and internships. Curated content only: no postings or employers of our own.
 */
export async function OpportunitiesPanel({
  userId,
  now,
  careersOn,
}: {
  userId: string;
  now: Date;
  careersOn: boolean;
}) {
  const profile = await loadProfile(userId);
  const built = safely("opportunities", () => ({
    programs: upcomingOpportunities(dueSoonRange(now).to, etDay(now), standingOf(profile)),
    handshake: handshakeLink(),
  }));
  if (!built) return <PanelError id="opportunities" title="Opportunities" what="Opportunities" />;
  const { programs, handshake } = built;
  return (
    <SectionCard
      id="opportunities"
      title="Opportunities"
      {...(careersOn ? { link: { href: routes.careers(), label: "Careers" } } : {})}
    >
      <ol className="-mt-1 divide-y divide-line">
        {programs.map((program) => (
          <li
            key={program.slug}
            data-testid="opportunity-item"
            data-aggregated={program.source}
            className="relative flex min-h-11 items-start justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm leading-snug font-semibold text-fg md:text-base">
                <a
                  href={program.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(STRETCHED_LINK, "hover:text-primary")}
                >
                  {program.name} <span className="sr-only">(opens in a new tab)</span>
                  <ExternalLink
                    aria-hidden
                    className="inline size-3.5 align-[-0.125em] text-fg-3"
                  />
                </a>
              </p>
              <p className="mt-1 text-xs text-fg-2 md:text-sm">{program.deadline.label}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2 md:text-sm">
                <SourceTag source={program.source} />
                {program.office ? <span>{program.office}</span> : null}
                {program.audience && !program.forYou ? (
                  <span data-testid="opportunity-audience">For: {program.audience}</span>
                ) : null}
              </p>
            </div>
            {/* Only the short date here: a long label in a column that cannot shrink squeezes the title. */}
            <p className="shrink-0 text-right font-mono text-xs leading-5 whitespace-nowrap text-fg-2">
              {shortDay(program.deadline.date)}
            </p>
          </li>
        ))}
        <li
          data-testid="opportunity-item"
          data-aggregated="handshake"
          className="relative flex min-h-11 items-start gap-3 py-3"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-fg-2"
          >
            <BriefcaseBusiness className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm leading-snug font-semibold text-fg md:text-base">
              <a
                href={handshake.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(STRETCHED_LINK, "hover:text-primary")}
              >
                Jobs and internships on Handshake{" "}
                <span className="sr-only">(opens in a new tab)</span>
                <ExternalLink aria-hidden className="inline size-3.5 align-[-0.125em] text-fg-3" />
              </a>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2 md:text-sm">
              <SourceTag source="handshake" />
              <span>Sign in with your Davidson account</span>
            </p>
          </div>
        </li>
      </ol>
    </SectionCard>
  );
}
