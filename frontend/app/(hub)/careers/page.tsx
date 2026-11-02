import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, SearchX, Users } from "lucide-react";
import { PREVIEW_NOTICE_TITLE } from "@/app/(hub)/alumni/preview/_components/preview-notice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/lib/routes";
import { CAREERS, careersByCluster } from "@/server/content/careers";
import { requireUser } from "@/server/auth/session";
import {
  alumniPreviewEnabled,
  featureEnabled,
  featureMetadata,
  loadFlags,
  requireFeature,
} from "@/server/features";
import {
  careersHref,
  clusterSlug,
  filterCareers,
  parseCareerFilters,
  type SearchParamsRecord,
} from "./_lib/filters";
import { CareerCard } from "./_components/career-card";
import { CareerFilters } from "./_components/career-filters";

/**
 * /careers (PLAN §3): the 24 career paths from the curated content (server/content/careers.ts), grouped by cluster,
 * filtered by cluster and text in the URL (`?cluster=technology&q=data`).
 *
 * Behind FEATURE_CAREERS (404 while it is off; the shell hides Careers then): featureMetadata() is the
 * generateMetadata and requireFeature() the page's first line. Alumni is nested under Careers in the sidebar, which
 * the 720-1179px rail has no room to show, so the header links to it (while the Alumni section is on). The header
 * also opens the Davidson Connect preview (fictional sample profiles, /alumni/preview) while FEATURE_ALUMNI_PREVIEW
 * is on, named and marked as such, so the sample data is never taken for the verified directory.
 */
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("careers", { title: "Careers" });
}

export default async function CareersPage({
  searchParams,
}: { searchParams?: Promise<SearchParamsRecord> } = {}) {
  await requireFeature("careers");
  // Its own sign-in check: the hub layout renders in parallel with the page, so a page relying on the layout
  // alone streams its content into the signed-out visitor's redirect.
  await requireUser();
  const filters = parseCareerFilters((await searchParams) ?? {});
  const groups = careersByCluster();
  const shown = new Set(filterCareers(CAREERS, filters));
  const visibleGroups = groups
    .map((group) => ({ ...group, careers: group.careers.filter((career) => shown.has(career)) }))
    .filter((group) => group.careers.length > 0);
  const filtered = filters.cluster !== null || filters.q !== "";
  const flags = loadFlags();
  const alumni = featureEnabled(flags, "alumni");
  const preview = alumniPreviewEnabled(flags);

  return (
    <>
      <PageHeader
        title="Careers"
        subtitle={
          <>
            Where does a major actually lead? Browse <b>{CAREERS.length} career paths</b> with the
            Davidson courses, pay data from the U.S. Bureau of Labor Statistics (the median across
            all experience levels, not starting pay) and the people who can help you get there.
          </>
        }
        actions={alumni || preview ? <HeaderLinks alumni={alumni} preview={preview} /> : null}
      />
      <CareerFilters
        filters={filters}
        total={filterCareers(CAREERS, { cluster: null, q: filters.q }).length}
        clusters={groups.map((group) => ({
          cluster: group.cluster,
          // What the chip leads to: this cluster with the current search text.
          count: filterCareers(group.careers, { cluster: group.cluster, q: filters.q }).length,
        }))}
      />
      {filtered ? (
        <p className="-mt-2 mb-4 text-sm text-fg-2" data-testid="careers-count">
          Showing {shown.size} of {CAREERS.length} career paths
          {filters.q ? <> for “{filters.q}”</> : null}
        </p>
      ) : null}

      {visibleGroups.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No career paths match"
          description={<p>Try another word, or look through every cluster.</p>}
          action={
            <Button asChild variant="secondary">
              <Link href={careersHref()}>Show all careers</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {visibleGroups.map((group) => {
            const headingId = `cluster-${clusterSlug(group.cluster)}`;
            return (
              <section key={group.cluster} aria-labelledby={headingId}>
                <h2
                  id={headingId}
                  className="mb-3 font-display text-lg font-strong tracking-title text-fg"
                >
                  {group.cluster}{" "}
                  <span className="font-sans text-xs font-medium text-fg-3 tabular-nums">
                    {group.careers.length}
                  </span>
                </h2>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.careers.map((career) => (
                    <li key={career.slug} className="min-w-0">
                      <CareerCard career={career} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * The header's links into the alumni views, each while it is on: the verified directory ("Alumni", its one label
 * everywhere, like the sidebar's) and the Davidson Connect preview, named and marked as the sample-data preview so
 * the two never read as one.
 */
function HeaderLinks({ alumni, preview }: { alumni: boolean; preview: boolean }) {
  return (
    <>
      {alumni ? (
        <Button asChild variant="secondary">
          <Link href={routes.alumni()}>
            <Users aria-hidden className="size-4" />
            Alumni
          </Link>
        </Button>
      ) : null}
      {preview ? (
        <Button asChild variant="secondary">
          <Link href={routes.alumniPreview()} data-testid="alumni-preview-link">
            <FlaskConical aria-hidden className="size-4" />
            {/* Named as sample data here too: the link sits beside the verified "Alumni" button. */}
            {PREVIEW_NOTICE_TITLE}
          </Link>
        </Button>
      ) : null}
    </>
  );
}
