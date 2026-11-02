import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { controlClass, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { sampleIndustrySlug } from "@/server/content/alumni-sample";
import {
  hasSampleFilters,
  SAMPLE_QUERY_MAX,
  samplePreviewHref,
  type SampleFacets,
  type SampleFilters as Filters,
} from "../_lib/sample-directory";

/**
 * The preview's filters: the verified directory's form (app/(hub)/alumni/_components/alumni-filters.tsx) pointed
 * at /alumni/preview, with the sample cards' own industries. A plain GET form (PLAN §7 "State"): search, career
 * path, class year, industry, then "Apply"; choosing an option never submits by itself. Keyed on the filters and
 * autoComplete="off" for the same reasons as the directory's.
 */
export function SampleFilters({ filters, facets }: { filters: Filters; facets: SampleFacets }) {
  const select = cn(controlClass, "h-11 px-3 md:h-10");
  return (
    <form
      key={samplePreviewHref(filters)}
      method="get"
      action={routes.alumniPreview()}
      autoComplete="off"
      aria-label="Filter sample profiles"
      className="mb-5 grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-card md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] xl:items-end"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-q">Search</Label>
        <Input
          id="preview-q"
          name="q"
          type="search"
          defaultValue={filters.q}
          maxLength={SAMPLE_QUERY_MAX}
          placeholder="Name, role, city, major"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-career">Career path</Label>
        <select
          id="preview-career"
          autoComplete="off"
          name="career"
          defaultValue={filters.career ?? ""}
          className={select}
        >
          <option value="">All career paths</option>
          {facets.careers.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-year">Class year</Label>
        <select
          id="preview-year"
          autoComplete="off"
          name="year"
          defaultValue={filters.year !== null ? String(filters.year) : ""}
          className={select}
        >
          <option value="">All class years</option>
          {facets.years.map((option) => (
            <option key={option.value} value={String(option.value)}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="preview-industry">Industry</Label>
        <select
          id="preview-industry"
          autoComplete="off"
          name="industry"
          defaultValue={filters.industry ? sampleIndustrySlug(filters.industry) : ""}
          className={select}
        >
          <option value="">All industries</option>
          {facets.industries.map((option) => (
            <option key={option.value} value={sampleIndustrySlug(option.value)}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-1">
        <Button type="submit">
          <Search aria-hidden />
          Apply
        </Button>
        {hasSampleFilters(filters) ? (
          <Button asChild variant="ghost">
            <Link href={routes.alumniPreview()}>Clear filters</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
