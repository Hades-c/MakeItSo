import { z } from "zod";
import { queryString } from "@/lib/routes";
import { queryText } from "@/lib/types/common";
import { CAREER_CLUSTERS, type Career } from "@/lib/types/content";
import { foldText } from "@/server/content/define";

/**
 * /careers filters (PLAN §3; §7 "State": filters live in URL search params): `?cluster=<slug>&q=<text>`.
 * Bad values never fail the page: an unknown cluster is ignored and the text is trimmed and capped (queryText).
 */

export type CareerCluster = (typeof CAREER_CLUSTERS)[number];

/** URL form of a cluster: "Business & Finance" → "business-and-finance". */
export function clusterSlug(cluster: CareerCluster): string {
  return foldText(cluster)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CLUSTER_BY_SLUG = new Map(CAREER_CLUSTERS.map((cluster) => [clusterSlug(cluster), cluster]));

/** The cluster a URL slug names, or null. */
export function clusterFromSlug(slug: string | null | undefined): CareerCluster | null {
  return (slug && CLUSTER_BY_SLUG.get(slug)) || null;
}

/** Longest search text kept from the URL. */
export const CAREER_QUERY_MAX = 80;

const CareerParamsSchema = z.object({
  cluster: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => clusterFromSlug(Array.isArray(value) ? value[0] : value)),
  q: queryText(CAREER_QUERY_MAX),
});

export interface CareerFilters {
  cluster: CareerCluster | null;
  q: string;
}

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** Filters from a page's searchParams (never throws). */
export function parseCareerFilters(params: SearchParamsRecord | undefined): CareerFilters {
  const parsed = CareerParamsSchema.safeParse(params ?? {});
  return parsed.success ? parsed.data : { cluster: null, q: "" };
}

/** Everything a career's text search looks at (folded): what the card and the page show about it. */
function haystack(career: Career): string {
  return foldText(
    [
      career.name,
      career.cluster,
      career.summary,
      ...career.whatYouDo,
      ...career.departments.flatMap((d) => [d.code, d.name]),
      ...career.relatedPrograms.map((p) => p.name),
      ...career.courses.flatMap((c) => [c.code, c.title]),
      career.handshakeQuery,
    ].join(" | "),
  );
}

const HAYSTACKS = new WeakMap<Career, string>();

function textOf(career: Career): string {
  let text = HAYSTACKS.get(career);
  if (text === undefined) {
    text = haystack(career);
    HAYSTACKS.set(career, text);
  }
  return text;
}

/**
 * The careers matching the filters, in their original order: the cluster (when set), and every word of the query
 * somewhere in the career's text ("data science" matches Data Science; "csc 221" matches careers with CSC 221).
 */
export function filterCareers(careers: readonly Career[], filters: CareerFilters): Career[] {
  const words = foldText(filters.q).split(" ").filter(Boolean);
  return careers.filter(
    (career) =>
      (filters.cluster === null || career.cluster === filters.cluster) &&
      words.every((word) => textOf(career).includes(word)),
  );
}

/**
 * /careers with filters. lib/routes.ts `routes.careers()` takes no parameters yet (contractRequest); this builds
 * the same path with the cluster slug and the query.
 */
export function careersHref(filters: Partial<CareerFilters> = {}): string {
  return `/careers${queryString({
    cluster: filters.cluster ? clusterSlug(filters.cluster) : undefined,
    q: filters.q?.trim(),
  })}`;
}
