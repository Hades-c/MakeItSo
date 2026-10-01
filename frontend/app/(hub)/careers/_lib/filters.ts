import * as z from "zod";
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

/** Folded words of a text: "Data Science & Analytics" → ["data", "science", "and", "analytics"]. */
function words(text: string): string[] {
  return foldText(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

interface SearchText {
  /** Names a student searches by: the career, its cluster, departments, programs, courses, Handshake words. */
  names: string[];
  /** The career's prose (summary, what you'd do): whole words only, so "art" never finds "start". */
  prose: Set<string>;
}

function searchText(career: Career): SearchText {
  return {
    names: words(
      [
        career.name,
        career.cluster,
        ...career.departments.flatMap((d) => [d.code, d.name]),
        ...career.relatedPrograms.map((p) => p.name),
        ...career.courses.flatMap((c) => [c.code, c.title]),
        career.handshakeQuery,
      ].join(" "),
    ),
    prose: new Set(words([career.summary, ...career.whatYouDo].join(" "))),
  };
}

const SEARCH_TEXT = new WeakMap<Career, SearchText>();

function textOf(career: Career): SearchText {
  let text = SEARCH_TEXT.get(career);
  if (text === undefined) {
    text = searchText(career);
    SEARCH_TEXT.set(career, text);
  }
  return text;
}

/**
 * One query word against a career: the start of a word in its names ("art" → Art, Arts, "Digital Art"; "econ" →
 * Economics; "221" → CSC 221), or a whole word of its prose, singular or plural ("hospital" → "hospitals").
 */
function matchesWord(text: SearchText, word: string): boolean {
  if (text.names.some((name) => name.startsWith(word))) return true;
  return (
    text.prose.has(word) ||
    text.prose.has(`${word}s`) ||
    text.prose.has(`${word}es`) ||
    (word.length > 3 && word.endsWith("s") && text.prose.has(word.slice(0, -1)))
  );
}

/**
 * The careers matching the filters, in their original order: the cluster (when set), and every word of the query
 * matching (matchesWord) at a word boundary, never inside a word ("data science" matches Data Science; "csc 221"
 * matches careers with CSC 221; "art" does not match "start", "ai" does not match "maintain").
 */
export function filterCareers(careers: readonly Career[], filters: CareerFilters): Career[] {
  const query = words(filters.q);
  return careers.filter(
    (career) =>
      (filters.cluster === null || career.cluster === filters.cluster) &&
      query.every((word) => matchesWord(textOf(career), word)),
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
