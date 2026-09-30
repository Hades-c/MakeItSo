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
 * are interleaved round-robin in provider priority order (courses, careers, pages, events, alumni), deduplicated
 * by kind + id, and capped at `limit`.
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

/** Round-robin merge of ranked lists, deduplicated by kind + id. */
export function interleave(lists: readonly SearchResult[][], limit: number): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest && out.length < limit; i++) {
    for (const list of lists) {
      const result = list[i];
      if (!result) continue;
      const key = `${result.kind}:${result.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(result);
      if (out.length >= limit) break;
    }
  }
  return out;
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
  return interleave(lists, limit);
}
