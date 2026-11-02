import "server-only";
import * as z from "zod";
import { routes } from "@/lib/routes";
import { queryText } from "@/lib/types/common";
import type { Career } from "@/lib/types/content";
import type { SearchParamsRecord } from "@/app/(hub)/careers/_lib/filters";
import type { FacetOption } from "@/app/(hub)/alumni/_lib/directory";
import {
  SAMPLE_INDUSTRIES,
  sampleIndustryFromSlug,
  sampleIndustrySlug,
  type SampleAlumnus,
  type SampleIndustry,
} from "@/server/content/alumni-sample";
import { foldText } from "@/server/content/define";

/**
 * The Davidson Connect preview's filters, like the verified directory's (app/(hub)/alumni/_lib/directory.ts):
 * `?career=<slug>&year=<class year>&industry=<industry slug>&q=<text>` in the URL (PLAN §7 "State"); unknown values
 * are ignored. "Industry" here is the sample card's own industry field (Davidson Connect profiles carry one); the
 * verified directory derives it from career clusters because its records store none.
 *
 * Sample profiles only: nothing here reads or returns a verified alumnus.
 */

export const SAMPLE_QUERY_MAX = 80;

export interface SampleFilters {
  career: string | null;
  year: number | null;
  industry: SampleIndustry | null;
  q: string;
}

export const NO_SAMPLE_FILTERS: SampleFilters = { career: null, year: null, industry: null, q: "" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const YearSchema = z
  .string()
  .regex(/^\d{4}$/)
  .transform(Number)
  .pipe(z.number().int().min(1900).max(2100));

export function parseSampleFilters(
  params: SearchParamsRecord | undefined,
  careerSlugs: readonly string[],
): SampleFilters {
  const source = params ?? {};
  const career = first(source.career);
  const year = YearSchema.safeParse(first(source.year));
  const q = queryText(SAMPLE_QUERY_MAX).safeParse(source.q);
  return {
    career: career && careerSlugs.includes(career) ? career : null,
    year: year.success ? year.data : null,
    industry: sampleIndustryFromSlug(first(source.industry)),
    q: q.success ? q.data : "",
  };
}

export function hasSampleFilters(filters: SampleFilters): boolean {
  return (
    filters.career !== null ||
    filters.year !== null ||
    filters.industry !== null ||
    filters.q !== ""
  );
}

type CareerLookup = ReadonlyMap<string, Pick<Career, "slug" | "name">>;

/** The text a search matches: everything the card shows. */
function searchText(record: SampleAlumnus, careers: CareerLookup): string {
  return foldText(
    [
      record.name,
      String(record.classYear),
      ...record.majors,
      record.role,
      record.organization,
      record.location,
      record.industry,
      ...record.careerPathSlugs.map((slug) => careers.get(slug)?.name ?? ""),
      ...record.canHelpWith,
    ].join(" | "),
  );
}

export function filterSamples(
  records: readonly SampleAlumnus[],
  filters: SampleFilters,
  careers: CareerLookup,
): SampleAlumnus[] {
  const words = foldText(filters.q).split(" ").filter(Boolean);
  return records.filter((record) => {
    if (filters.career !== null && !record.careerPathSlugs.includes(filters.career)) return false;
    if (filters.year !== null && record.classYear !== filters.year) return false;
    if (filters.industry !== null && record.industry !== filters.industry) return false;
    if (words.length === 0) return true;
    const text = searchText(record, careers);
    return words.every((word) => text.includes(word));
  });
}

export interface SampleFacets {
  careers: FacetOption<string>[];
  years: FacetOption<number>[];
  industries: FacetOption<SampleIndustry>[];
}

/** The choices each filter offers, counted over every sample profile: careers by name, years newest first. */
export function sampleFacets(
  records: readonly SampleAlumnus[],
  careers: CareerLookup,
): SampleFacets {
  const careerCounts = new Map<string, number>();
  const yearCounts = new Map<number, number>();
  const industryCounts = new Map<SampleIndustry, number>();
  for (const record of records) {
    for (const slug of new Set(record.careerPathSlugs)) {
      if (careers.has(slug)) careerCounts.set(slug, (careerCounts.get(slug) ?? 0) + 1);
    }
    yearCounts.set(record.classYear, (yearCounts.get(record.classYear) ?? 0) + 1);
    industryCounts.set(record.industry, (industryCounts.get(record.industry) ?? 0) + 1);
  }
  return {
    careers: [...careerCounts]
      .map(([slug, count]) => ({ value: slug, label: careers.get(slug)!.name, count }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    years: [...yearCounts]
      .map(([year, count]) => ({ value: year, label: String(year), count }))
      .sort((a, b) => b.value - a.value),
    industries: SAMPLE_INDUSTRIES.filter((industry) => industryCounts.has(industry)).map(
      (industry) => ({ value: industry, label: industry, count: industryCounts.get(industry)! }),
    ),
  };
}

/** /alumni/preview with these filters. */
export function samplePreviewHref(filters: Partial<SampleFilters> = {}): string {
  return routes.alumniPreview({
    career: filters.career ?? undefined,
    year: filters.year ?? undefined,
    industry: filters.industry ? sampleIndustrySlug(filters.industry) : undefined,
    q: filters.q,
  });
}

/** "Megan Hollis" → "MH": the card's avatar (no photos). */
export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words;
  return letters.map((word) => word[0]!.toUpperCase()).join("");
}
