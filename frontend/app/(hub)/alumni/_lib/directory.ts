import { z } from "zod";
import { queryString } from "@/lib/routes";
import { queryText } from "@/lib/types/common";
import type { Alumnus, Career } from "@/lib/types/content";
import {
  clusterFromSlug,
  clusterSlug,
  type CareerCluster,
  type SearchParamsRecord,
} from "@/app/(hub)/careers/_lib/filters";
import { foldText } from "@/server/content/define";

/**
 * The /alumni directory's filters (PLAN §3; §7 "State": in URL search params): `?career=<slug>&year=<class
 * year>&industry=<cluster slug>&q=<text>`. Unknown values are ignored, never an error page.
 *
 * "Industry" is the career cluster of the person's career paths (Technology, Health, ...): the alumni records
 * store no industry of their own (PLAN §1 lists every stored field), and their career paths are kept only where a
 * non-LinkedIn source supports them, so the cluster is the one sourced grouping there is. Someone with no career
 * path has no industry and only shows up without that filter.
 */

export const ALUMNI_QUERY_MAX = 80;

export interface AlumniFilters {
  career: string | null;
  year: number | null;
  industry: CareerCluster | null;
  q: string;
}

export const NO_ALUMNI_FILTERS: AlumniFilters = { career: null, year: null, industry: null, q: "" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A four-digit class year in the range the alumni schema allows. */
const YearSchema = z
  .string()
  .regex(/^\d{4}$/)
  .transform(Number)
  .pipe(z.number().int().min(1900).max(2100));

/** Filters from the page's searchParams; `careerSlugs` are the valid career slugs. */
export function parseAlumniFilters(
  params: SearchParamsRecord | undefined,
  careerSlugs: readonly string[],
): AlumniFilters {
  const source = params ?? {};
  const career = first(source.career);
  const year = YearSchema.safeParse(first(source.year));
  const q = queryText(ALUMNI_QUERY_MAX).safeParse(source.q);
  return {
    career: career && careerSlugs.includes(career) ? career : null,
    year: year.success ? year.data : null,
    industry: clusterFromSlug(first(source.industry)),
    q: q.success ? q.data : "",
  };
}

export function hasAlumniFilters(filters: AlumniFilters): boolean {
  return (
    filters.career !== null ||
    filters.year !== null ||
    filters.industry !== null ||
    filters.q !== ""
  );
}

type CareerLookup = ReadonlyMap<string, Pick<Career, "slug" | "name" | "cluster">>;

/** The industries (career clusters) of a person's career paths, in cluster order of first appearance. */
export function alumnusIndustries(alumnus: Alumnus, careers: CareerLookup): CareerCluster[] {
  const out: CareerCluster[] = [];
  for (const slug of alumnus.careerPathSlugs) {
    const cluster = careers.get(slug)?.cluster;
    if (cluster && !out.includes(cluster)) out.push(cluster);
  }
  return out;
}

/**
 * The text a search matches: the name and the fields the card shows. A field that is null ("see LinkedIn") is
 * never searched: it would re-use LinkedIn data (PLAN §1).
 */
function searchText(alumnus: Alumnus, careers: CareerLookup): string {
  return foldText(
    [
      alumnus.name,
      alumnus.classYear !== null ? String(alumnus.classYear) : "",
      ...(alumnus.majors ?? []),
      alumnus.role ?? "",
      alumnus.organization ?? "",
      ...alumnus.careerPathSlugs.map((slug) => careers.get(slug)?.name ?? ""),
    ].join(" | "),
  );
}

export function filterAlumni(
  alumni: readonly Alumnus[],
  filters: AlumniFilters,
  careers: CareerLookup,
): Alumnus[] {
  const words = foldText(filters.q).split(" ").filter(Boolean);
  return alumni.filter((alumnus) => {
    if (filters.career !== null && !alumnus.careerPathSlugs.includes(filters.career)) return false;
    if (filters.year !== null && alumnus.classYear !== filters.year) return false;
    if (
      filters.industry !== null &&
      !alumnusIndustries(alumnus, careers).includes(filters.industry)
    ) {
      return false;
    }
    if (words.length === 0) return true;
    const text = searchText(alumnus, careers);
    return words.every((word) => text.includes(word));
  });
}

export interface FacetOption<V> {
  value: V;
  label: string;
  count: number;
}

export interface AlumniFacets {
  careers: FacetOption<string>[];
  years: FacetOption<number>[];
  industries: FacetOption<CareerCluster>[];
}

/**
 * The choices each filter offers: only values someone in the directory has (counts over the whole directory, so
 * a choice never disappears while another filter is set). Careers by name, years newest first, industries in
 * cluster order.
 */
export function alumniFacets(
  alumni: readonly Alumnus[],
  careers: CareerLookup,
  clusterOrder: readonly CareerCluster[],
): AlumniFacets {
  const careerCounts = new Map<string, number>();
  const yearCounts = new Map<number, number>();
  const industryCounts = new Map<CareerCluster, number>();
  for (const alumnus of alumni) {
    for (const slug of new Set(alumnus.careerPathSlugs)) {
      if (careers.has(slug)) careerCounts.set(slug, (careerCounts.get(slug) ?? 0) + 1);
    }
    if (alumnus.classYear !== null) {
      yearCounts.set(alumnus.classYear, (yearCounts.get(alumnus.classYear) ?? 0) + 1);
    }
    for (const cluster of alumnusIndustries(alumnus, careers)) {
      industryCounts.set(cluster, (industryCounts.get(cluster) ?? 0) + 1);
    }
  }
  return {
    careers: [...careerCounts]
      .map(([slug, count]) => ({ value: slug, label: careers.get(slug)!.name, count }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    years: [...yearCounts]
      .map(([year, count]) => ({ value: year, label: String(year), count }))
      .sort((a, b) => b.value - a.value),
    industries: clusterOrder
      .filter((cluster) => industryCounts.has(cluster))
      .map((cluster) => ({ value: cluster, label: cluster, count: industryCounts.get(cluster)! })),
  };
}

/**
 * /alumni with filters. lib/routes.ts `routes.alumni()` knows only `career` so far (contractRequest: year,
 * industry, q); this builds the same path with every filter.
 */
export function alumniHref(filters: Partial<AlumniFilters> = {}): string {
  return `/alumni${queryString({
    career: filters.career ?? undefined,
    year: filters.year ?? undefined,
    industry: filters.industry ? clusterSlug(filters.industry) : undefined,
    q: filters.q?.trim(),
  })}`;
}
