import "server-only";
import type { SearchResult } from "@/lib/api/search";
import { routes } from "@/lib/routes";
import type { Alumnus } from "@/lib/types/content";
import { ALUMNI } from "@/server/content/alumni";
import { foldText as fold } from "@/server/content/define";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: verified alumni (server/content/alumni.ts). ONLY when the Alumni section is on, which needs
 * FEATURE_ALUMNI and FEATURE_CAREERS (PLAN §9: featureEnabled(flags, "alumni") in server/features.ts on
 * overhaul/main; this branch predates that file, so the same test is inlined below), AND the viewer is a verified
 * @davidson.edu account (`await ctx.isVerifiedDavidson()`, PLAN §1); otherwise it returns nothing. The flags are
 * checked first, so a switched-off section costs no verification lookup.
 * Matches the name (any word), then the shown organization and role; fields that are null ("see LinkedIn") are
 * never searched or shown. href routes.alumni().
 */

/** featureEnabled(flags, "alumni"): Alumni lives under Careers, so it needs both flags. */
function alumniSectionOn(flags: SearchContext["flags"]): boolean {
  return flags.alumni && flags.careers;
}

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

/**
 * "Class of 1985 · Retired; former Chairman, President & CEO, Hologic": only fields the directory itself shows.
 * When both are known the organization always follows the role, so a role such as "Retired; former ..." keeps a
 * past employer from reading as a current one.
 */
function subtitle(alumnus: Alumnus): string | undefined {
  const work = [alumnus.role, alumnus.organization].filter((part) => part !== null).join(", ");
  const year = alumnus.classYear !== null ? `Class of ${alumnus.classYear}` : "";
  const parts = [year, work].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export async function search(
  q: string,
  limit: number,
  ctx: SearchContext,
): Promise<SearchResult[]> {
  if (!alumniSectionOn(ctx.flags)) return [];
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
