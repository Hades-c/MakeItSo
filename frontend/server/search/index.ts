import "server-only";
import type { SearchResult } from "@/lib/api/search";
import { MissingFixtureError } from "@/server/http/fixtures";
import { search as alumni } from "@/server/search/providers/alumni";
import { search as careers } from "@/server/search/providers/careers";
import { search as courses } from "@/server/search/providers/courses";
import { search as events } from "@/server/search/providers/events";
import { search as pages } from "@/server/search/providers/pages";
import type { SearchContext, SearchProvider } from "@/server/search/types";

export type { SearchContext, SearchProvider } from "@/server/search/types";

/**
 * Global search (GET /api/search; contract in lib/api/search.ts). Runs every provider in parallel, each with a
 * time budget; a provider that fails or times out is logged and skipped so search never fails as a whole. Results
 * are merged by how well their title matches the query (matchStrength: exact, whole words, prefix, inside the
 * title, anything else), then round-robin in provider priority order (courses, careers, pages, events, alumni)
 * within a strength, deduplicated by kind + id, and capped at `limit`. So "plan" puts the My plan page above a
 * course that merely mentions planning, and "csc 221" puts CSC 221 first.
 */

export const PROVIDERS: ReadonlyArray<readonly [name: string, provider: SearchProvider]> = [
  ["courses", courses],
  ["careers", careers],
  ["pages", pages],
  ["events", events],
  ["alumni", alumni],
];

export const PROVIDER_TIMEOUT_MS = 1_500;

function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`search provider "${name}" timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** How well a result's title matches the query, strongest first (see matchStrength). */
export const MATCH_STRENGTHS = ["exact", "words", "prefix", "inside", "other"] as const;
export type MatchStrength = (typeof MATCH_STRENGTHS)[number];

/** Lower case, accents stripped, "&" read as "and", anything but letters and digits a single space. */
function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * How well `title` matches `q`, by what the palette shows:
 *   exact   the title, or one " · " part of it, is the query ("csc 221" → "CSC 221 · Data Structures"; "today")
 *   words   the query is a run of whole words of the title ("plan" → "My plan")
 *   prefix  the title or one of its words starts with the query ("plan" → "Urban Planning", "csc 2" → "CSC 221 …")
 *   inside  the query is elsewhere inside the title
 *   other   the provider matched another field (instructors, keywords, the subtitle, descriptions)
 */
export function matchStrength(title: string, q: string): MatchStrength {
  const query = normalizeForMatch(q);
  if (!query) return "other";
  if (title.split(" · ").some((part) => normalizeForMatch(part) === query)) return "exact";
  const text = normalizeForMatch(title);
  if (` ${text} `.includes(` ${query} `)) return "words";
  if (text.startsWith(query) || ` ${text}`.includes(` ${query}`)) return "prefix";
  if (text.includes(query)) return "inside";
  return "other";
}

/**
 * Merge ranked lists, deduplicated by kind + id and capped at `limit`: round-robin in list order, and, when `q` is
 * given, stably regrouped by matchStrength(title, q), so a stronger match from a later provider comes first while
 * each provider's own order holds within a strength.
 */
export function interleave(
  lists: readonly SearchResult[][],
  limit: number,
  q?: string,
): SearchResult[] {
  const merged: SearchResult[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const result = list[i];
      if (!result) continue;
      const key = `${result.kind}:${result.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(result);
    }
  }
  if (q === undefined) return merged.slice(0, Math.max(0, limit));
  const rank = (result: SearchResult) => MATCH_STRENGTHS.indexOf(matchStrength(result.title, q));
  return merged
    .map((result, order) => ({ result, order, rank: rank(result) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map(({ result }) => result);
}

export async function search(
  q: string,
  limit: number,
  ctx: SearchContext,
  providers: ReadonlyArray<readonly [string, SearchProvider]> = PROVIDERS,
): Promise<SearchResult[]> {
  const needle = q.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!needle || limit < 1) return [];
  const settled = await Promise.allSettled(
    providers.map(([name, provider]) =>
      withTimeout(provider(needle, limit, ctx), PROVIDER_TIMEOUT_MS, name),
    ),
  );
  const lists = settled.map((outcome, i) => {
    if (outcome.status === "fulfilled") return outcome.value.slice(0, limit);
    // A missing fixture is a test bug: never hide it.
    if (outcome.reason instanceof MissingFixtureError) throw outcome.reason;
    console.error(`[search] provider "${providers[i]?.[0]}" failed:`, outcome.reason);
    return [];
  });
  return interleave(lists, limit, needle);
}
