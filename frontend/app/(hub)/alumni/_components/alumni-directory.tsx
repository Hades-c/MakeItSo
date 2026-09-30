import Link from "next/link";
import { SearchX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { SearchParamsRecord } from "@/app/(hub)/careers/_lib/filters";
import { CAREER_CLUSTERS, type Alumnus } from "@/lib/types/content";
import { isMailAvailable } from "@/server/auth/mailer";
import { getSessionUser } from "@/server/auth/session";
import { ALUMNI_CHECKED_AT, alumniDirectory } from "@/server/content/alumni";
import { CAREER_SLUGS } from "@/server/content/careers";
import { loadFlags } from "@/server/features";
import { alumniAccessFor, alumniGateCopy } from "../_lib/access";
import { CAREERS_BY_SLUG, careersOf } from "../_lib/careers";
import {
  alumniFacets,
  alumniHref,
  filterAlumni,
  hasAlumniFilters,
  parseAlumniFilters,
} from "../_lib/directory";
import { AlumniFilters } from "./alumni-filters";
import { AlumniGateNotice } from "./alumni-gate-notice";
import { AlumnusCard } from "./alumnus-card";
import { ProvenanceLine } from "./provenance-line";

function AlumniGrid({ alumni }: { alumni: readonly Alumnus[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {alumni.map((alumnus) => (
        <li key={alumnus.id} className="flex min-w-0">
          <AlumnusCard
            alumnus={alumnus}
            careers={careersOf(alumnus)}
            notableNote={false}
            className="w-full"
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The directory body of /alumni: the gate (server-side, per request), then the provenance line, the filters and
 * the cards. Alumni a student may contact come first; "Notable alumni" (contactable=false: public figures,
 * trustees, college officers) are a separate group with no contact affordance.
 */
export async function AlumniDirectory({ params }: { params: SearchParamsRecord }) {
  const filters = parseAlumniFilters(params, CAREER_SLUGS);
  const user = await getSessionUser();
  const access = alumniAccessFor(user, loadFlags(), isMailAvailable);
  // requireFeature() already answered 404 for "off"; a flag flipping mid-request shows nothing rather than data.
  if (access.kind === "off") return null;
  if (access.kind !== "open") {
    return <AlumniGateNotice {...alumniGateCopy(access, alumniHref(filters))} />;
  }

  const all = alumniDirectory();
  if (all.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No verified alumni yet"
        description={
          <p>
            Alumni are listed only once their Davidson degree and public profile are both verified.
          </p>
        }
      />
    );
  }

  const facets = alumniFacets(all, CAREERS_BY_SLUG, CAREER_CLUSTERS);
  const shown = filterAlumni(all, filters, CAREERS_BY_SLUG);
  const reachable = shown.filter((alumnus) => alumnus.contactable);
  const notable = shown.filter((alumnus) => !alumnus.contactable);
  const filtered = hasAlumniFilters(filters);

  return (
    <div data-testid="alumni-directory">
      <ProvenanceLine checkedAt={ALUMNI_CHECKED_AT} className="mb-4" />
      <AlumniFilters filters={filters} facets={facets} />
      <p className="mb-4 text-sm text-fg-2" data-testid="alumni-count">
        {filtered
          ? `Showing ${shown.length} of ${all.length} verified alumni`
          : `${all.length} verified alumni`}
      </p>

      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No alumni match these filters"
          description={<p>Try fewer filters or a different search.</p>}
          action={
            <Button asChild variant="secondary">
              <Link href="/alumni">Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {reachable.length > 0 ? (
            <section aria-labelledby="alumni-reachable-title">
              <h2
                id="alumni-reachable-title"
                className="mb-3 text-lg font-strong tracking-title text-fg"
              >
                Alumni{" "}
                <span className="font-mono text-xs font-medium text-fg-3">{reachable.length}</span>
              </h2>
              <AlumniGrid alumni={reachable} />
            </section>
          ) : null}
          {notable.length > 0 ? (
            <section aria-labelledby="alumni-notable-title" data-testid="notable-alumni">
              <h2 id="alumni-notable-title" className="text-lg font-strong tracking-title text-fg">
                Notable alumni{" "}
                <span className="font-mono text-xs font-medium text-fg-3">{notable.length}</span>
              </h2>
              <p className="mt-1 mb-3 text-sm text-fg-2">
                Public figures, trustees and college officers, listed for reference. Please don’t
                cold-contact them through MakeItSo.
              </p>
              <AlumniGrid alumni={notable} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
