import "server-only";
import type { SearchResult } from "@/lib/api/search";
import { routes } from "@/lib/routes";
import { CAREERS } from "@/server/content/careers";
import { foldText as fold } from "@/server/content/define";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: career paths (server/content/careers.ts), only when flags.careers. href routes.career(slug).
 * Ranking (ties keep list order): the name starts with the query; a word of the name starts with it; the name
 * contains it; the cluster, slug, departments, related programs or Handshake keywords contain it.
 *
 * Fragments shorter than PARTIAL_MIN letters match only the start of the name or whole words: the aggregator
 * interleaves providers instead of comparing scores, so a short app word such as "plan" must not put "Urban
 * Planning" ahead of the My plan page. Summaries are not searched (their verbs, "plan", "design", "build", match
 * almost every career).
 */

const INDEX = CAREERS.map((career, index) => {
  const name = fold(career.name);
  return {
    career,
    index,
    name,
    words: name.split(/[\s/,-]+/).filter(Boolean),
    keywords: fold(
      [
        career.cluster,
        career.slug.replace(/-/g, " "),
        career.handshakeQuery,
        ...career.departments.map((d) => d.name),
        ...career.relatedPrograms.map((p) => p.name),
      ].join(" | "),
    ),
  };
});

/** Shorter queries only match a name's start or whole words (see above). */
export const PARTIAL_MIN = 5;

function hasWord(text: string, needle: string): boolean {
  return ` ${text.replace(/[^a-z0-9]+/g, " ")} `.includes(
    ` ${needle.replace(/[^a-z0-9]+/g, " ").trim()} `,
  );
}

function score(entry: (typeof INDEX)[number], needle: string): number {
  const partial = needle.length >= PARTIAL_MIN;
  if (entry.name.startsWith(needle)) return 4;
  if (entry.words.some((word) => (partial ? word.startsWith(needle) : word === needle))) return 3;
  if (partial ? entry.name.includes(needle) : hasWord(entry.name, needle)) return 2;
  if (partial ? entry.keywords.includes(needle) : hasWord(entry.keywords, needle)) return 1;
  return 0;
}

export async function search(
  q: string,
  limit: number,
  ctx: SearchContext,
): Promise<SearchResult[]> {
  if (!ctx.flags.careers) return [];
  const needle = fold(q);
  if (!needle || limit < 1) return [];
  return INDEX.map((entry) => ({ entry, score: score(entry, needle) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.index - b.entry.index)
    .slice(0, limit)
    .map(({ entry: { career } }) => ({
      kind: "career" as const,
      id: career.slug,
      title: career.name,
      subtitle: career.cluster,
      href: routes.career(career.slug),
    }));
}
