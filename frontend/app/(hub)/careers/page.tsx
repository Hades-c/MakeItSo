import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { CAREERS, careersByCluster } from "@/server/content/careers";
import { featureMetadata, requireFeature } from "@/server/features";
import {
  careersHref,
  clusterSlug,
  filterCareers,
  parseCareerFilters,
  type SearchParamsRecord,
} from "./_lib/filters";
import { CareerCard } from "./_components/career-card";
import { CareerFilters } from "./_components/career-filters";
import { OfferedCount } from "./_components/offered-count";

/**
 * /careers (PLAN §3): the 24 career paths from the curated content (server/content/careers.ts), grouped by cluster,
 * filtered by cluster and text in the URL (`?cluster=technology&q=data`). Each card streams in how many of its
 * courses are on the registration term's schedule (live catalog; nothing when it cannot say).
 *
 * Behind FEATURE_CAREERS (404 while it is off; the shell hides Careers then): featureMetadata() is the
 * generateMetadata and requireFeature() the page's first line.
 */
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("careers", { title: "Careers" });
}

export default async function CareersPage({
  searchParams,
}: { searchParams?: Promise<SearchParamsRecord> } = {}) {
  await requireFeature("careers");
  const filters = parseCareerFilters((await searchParams) ?? {});
  const groups = careersByCluster();
  const shown = new Set(filterCareers(CAREERS, filters));
  const visibleGroups = groups
    .map((group) => ({ ...group, careers: group.careers.filter((career) => shown.has(career)) }))
    .filter((group) => group.careers.length > 0);
  const filtered = filters.cluster !== null || filters.q !== "";

  return (
    <>
      <PageHeader
        title="Careers"
        subtitle={
          <>
            <b>{CAREERS.length} career paths</b>, the Davidson courses that lead to them, pay from
            the Bureau of Labor Statistics, and the people and programs that can help.
          </>
        }
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
                <h2 id={headingId} className="mb-3 text-lg font-strong tracking-title text-fg">
                  {group.cluster}{" "}
                  <span className="font-mono text-xs font-medium text-fg-3">
                    {group.careers.length}
                  </span>
                </h2>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.careers.map((career) => (
                    <li key={career.slug} className="min-w-0">
                      <CareerCard
                        career={career}
                        offered={
                          <Suspense fallback={null}>
                            <OfferedCount codes={career.courses.map((course) => course.code)} />
                          </Suspense>
                        }
                      />
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
