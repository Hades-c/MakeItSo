import "server-only";
import type { SearchResult } from "@/lib/api/search";
import { routes } from "@/lib/routes";
import { termLabel } from "@/lib/term";
import { browseTerm } from "@/server/catalog/read";
import { matchedSectionTitle, paletteMatches } from "@/server/catalog/search";
import { getTermIndex } from "@/server/catalog/store";
import { resolveTermsImpl } from "@/server/catalog/terms";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: courses (owner W1) for the ⌘K palette, in the registration term, or the current term while
 * the registration term's schedule is not published yet (the first weeks of each semester; see browseTerm).
 * Precise rather than exhaustive: course codes in any spelling ("csc121" → CSC 121, cross-listed and registration
 * codes too), partial codes ("CSC 2"), department codes, and words in course or section titles and instructor
 * names; the full-text search including descriptions is the catalog page (/courses?q=, the palette's Enter
 * fallback). Best first; the subtitle names the term, the matching topic of a topics course, and instructors;
 * href routes.course(term, code); source "course-schedule".
 */
export async function search(
  q: string,
  limit: number,
  ctx: SearchContext,
): Promise<SearchResult[]> {
  const resolved = await resolveTermsImpl({ now: ctx.now });
  const term = await browseTerm(resolved);
  if (!term) return [];
  const index = await getTermIndex(term);
  const label = termLabel(term);
  return paletteMatches(index, q, limit).map((match) => {
    const people = match.summary.instructorNames.slice(0, 2).join(", ");
    const topic = matchedSectionTitle(match, q);
    return {
      kind: "course" as const,
      id: `${term}:${match.code}`,
      title: `${match.code} · ${match.course.title}`,
      subtitle: [label, topic, people].filter(Boolean).join(" · "),
      href: routes.course(term, match.code),
      source: "course-schedule" as const,
    };
  });
}
