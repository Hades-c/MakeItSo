import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CAREERS_BY_SLUG, type AlumnusCareer } from "@/app/(hub)/alumni/_lib/careers";
import type { SearchParamsRecord } from "@/app/(hub)/careers/_lib/filters";
import { routes } from "@/lib/routes";
import { sampleAlumniDirectory, type SampleAlumnus } from "@/server/content/alumni-sample";
import { CAREER_SLUGS } from "@/server/content/careers";
import {
  filterSamples,
  hasSampleFilters,
  parseSampleFilters,
  sampleFacets,
} from "../_lib/sample-directory";
import { SampleAlumnusCard } from "./sample-alumnus-card";
import { SampleFilters } from "./sample-filters";

function careersOf(record: SampleAlumnus): AlumnusCareer[] {
  return record.careerPathSlugs.flatMap((slug) => {
    const career = CAREERS_BY_SLUG.get(slug);
    return career ? [{ slug, name: career.name }] : [];
  });
}

/**
 * The preview's body under its notice: the filters, the count ("28 sample profiles", never "alumni" alone) and the
 * sample cards. The count is said once, in that line (which also carries "Showing N of M" while filtered): the
 * one section's heading has none, unlike the verified directory, whose two sections each count their own. Sample data only (server/content/alumni-sample.ts); it never reads the verified directory.
 */
export function SampleDirectory({ params }: { params: SearchParamsRecord }) {
  const filters = parseSampleFilters(params, CAREER_SLUGS);
  const all = sampleAlumniDirectory();
  const shown = filterSamples(all, filters, CAREERS_BY_SLUG);
  const facets = sampleFacets(all, CAREERS_BY_SLUG);

  return (
    <div data-testid="sample-directory">
      <SampleFilters filters={filters} facets={facets} />
      <p className="mb-4 text-sm text-fg-2" data-testid="sample-count">
        {hasSampleFilters(filters)
          ? `Showing ${shown.length} of ${all.length} sample profiles`
          : `${all.length} sample profiles`}
      </p>
      {shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No sample profiles match these filters"
          description={<p>Try fewer filters or a different search.</p>}
          action={
            <Button asChild variant="secondary">
              <Link href={routes.alumniPreview()}>Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="sample-profiles-title">
          <h2
            id="sample-profiles-title"
            className="mb-3 font-display text-lg font-strong tracking-title text-fg"
          >
            Sample profiles
          </h2>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((record) => (
              <li key={record.id} className="flex min-w-0">
                <SampleAlumnusCard record={record} careers={careersOf(record)} className="w-full" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
