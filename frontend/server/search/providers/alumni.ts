import "server-only";
import type { SearchResult } from "@/lib/api/search";
import { routes } from "@/lib/routes";
import type { Alumnus } from "@/lib/types/content";
import { ALUMNI } from "@/server/content/alumni";
import { foldText as fold } from "@/server/content/define";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: verified alumni (server/content/alumni.ts). ONLY when flags.alumni is on AND the viewer is a
 * verified @davidson.edu account (`await ctx.isVerifiedDavidson()`, PLAN §1); otherwise it returns nothing.
 * Matches the name (any word), then the shown organization and role; fields that are null ("see LinkedIn") are
 * never searched or shown. href routes.alumni().
 */

const INDEX = ALUMNI.map((alumnus, index) => {
  const name = fold(alumnus.name);
  return {
    alumnus,
    index,
    name,
    words: name.split(/[\s.-]+/).filter(Boolean),
    work: fold([alumnus.organization, alumnus.role].filter((v) => v !== null).join(" | ")),
  };
});

function score(entry: (typeof INDEX)[number], needle: string): number {
  if (entry.name.startsWith(needle)) return 4;
  if (entry.words.some((word) => word.startsWith(needle))) return 3;
  if (entry.name.includes(needle)) return 2;
  if (entry.work.includes(needle)) return 1;
  return 0;
}

/** "Class of 2023 · McKinsey & Company": only fields the directory itself shows. */
function subtitle(alumnus: Alumnus): string | undefined {
  const parts = [
    alumnus.classYear !== null ? `Class of ${alumnus.classYear}` : null,
    alumnus.organization,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export async function search(
  q: string,
  limit: number,
  ctx: SearchContext,
): Promise<SearchResult[]> {
  if (!ctx.flags.alumni) return [];
  if (!(await ctx.isVerifiedDavidson())) return [];
  const needle = fold(q);
  if (!needle || limit < 1) return [];
  return INDEX.map((entry) => ({ entry, score: score(entry, needle) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.index - b.entry.index)
    .slice(0, limit)
    .map(({ entry: { alumnus } }) => {
      const result: SearchResult = {
        kind: "alumnus",
        id: alumnus.id,
        title: alumnus.name,
        href: routes.alumni(),
      };
      const text = subtitle(alumnus);
      if (text) result.subtitle = text;
      return result;
    });
}
