import "server-only";
import type { SearchResult } from "@/lib/api/search";
import { routes } from "@/lib/routes";
import { termLabel } from "@/lib/term";
import { ensureTermData } from "@/server/catalog/refresh";
import { paletteMatches } from "@/server/catalog/search";
import { getTermIndex } from "@/server/catalog/store";
import { resolveTermsImpl } from "@/server/catalog/terms";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: courses (owner W1) for the ⌘K palette, in the registration term. Precise rather than
 * exhaustive: course codes in any spelling ("csc121" → CSC 121, cross-listed and registration codes too),
 * partial codes ("CSC 2"), department codes, and words in course or section titles and instructor names; the
 * full-text search including descriptions is the catalog page (/courses?q=, the palette's Enter fallback). Best
 * first; href routes.course(term, code); source "course-schedule".
 */
export async function search(
  q: string,
  limit: number,
  ctx: SearchContext,
): Promise<SearchResult[]> {
  const resolved = await resolveTermsImpl({ now: ctx.now });
  const term = resolved.registration;
  if (!(await ensureTermData(term, resolved))) return [];
  const index = await getTermIndex(term);
  const label = termLabel(term);
  return paletteMatches(index, q, limit).map(({ code, course, summary }) => {
    const people = summary.instructorNames.slice(0, 2).join(", ");
    return {
      kind: "course" as const,
      id: `${term}:${code}`,
      title: `${code} · ${course.title}`,
      subtitle: people ? `${label} · ${people}` : label,
      href: routes.course(term, code),
      source: "course-schedule" as const,
    };
  });
}
