import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { controlClass, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clusterSlug } from "@/app/(hub)/careers/_lib/filters";
import { cn } from "@/lib/utils";
import {
  ALUMNI_QUERY_MAX,
  hasAlumniFilters,
  type AlumniFacets,
  type AlumniFilters as Filters,
} from "../_lib/directory";

/**
 * The directory's filters as a plain GET form (PLAN §7 "State": everything in the URL, so a filtered view can be
 * shared and works without JavaScript): search, career path, class year and industry, then "Apply". Choosing an
 * option never submits by itself (no change of context on input).
 */
export function AlumniFilters({ filters, facets }: { filters: Filters; facets: AlumniFacets }) {
  const select = cn(controlClass, "h-11 px-3 md:h-10");
  return (
    <form
      method="get"
      action="/alumni"
      aria-label="Filter alumni"
      className="mb-5 grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-card md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] xl:items-end"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alumni-q">Search</Label>
        <Input
          id="alumni-q"
          name="q"
          type="search"
          defaultValue={filters.q}
          maxLength={ALUMNI_QUERY_MAX}
          placeholder="Name, role, organization, major"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alumni-career">Career path</Label>
        <select
          id="alumni-career"
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
        <Label htmlFor="alumni-year">Class year</Label>
        <select
          id="alumni-year"
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
        <Label htmlFor="alumni-industry">Industry</Label>
        <select
          id="alumni-industry"
          name="industry"
          defaultValue={filters.industry ? clusterSlug(filters.industry) : ""}
          className={select}
        >
          <option value="">All industries</option>
          {facets.industries.map((option) => (
            <option key={option.value} value={clusterSlug(option.value)}>
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
        {hasAlumniFilters(filters) ? (
          <Button asChild variant="ghost">
            <Link href="/alumni">Clear filters</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
