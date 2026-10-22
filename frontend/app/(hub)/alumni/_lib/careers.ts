import "server-only";
import type { Alumnus, Career } from "@/lib/types/content";
import { CAREERS } from "@/server/content/careers";

/** A career path as an alumnus card names it. */
export interface AlumnusCareer {
  slug: string;
  name: string;
}

/** The career paths by slug, for the alumni filters and cards. */
export const CAREERS_BY_SLUG: ReadonlyMap<string, Career> = new Map(
  CAREERS.map((career) => [career.slug, career]),
);

/** The career paths to name on a card (slugs the content does not know are skipped). */
export function careersOf(alumnus: Alumnus): AlumnusCareer[] {
  return alumnus.careerPathSlugs.flatMap((slug) => {
    const career = CAREERS_BY_SLUG.get(slug);
    return career ? [{ slug, name: career.name }] : [];
  });
}
