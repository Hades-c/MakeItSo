import "server-only";
import { resolveSummers, type SummerView } from "@/app/(hub)/careers/_lib/activities";
import { SOURCES } from "@/lib/sources";
import type { SummerOption } from "@/lib/types/ai";
import type { Career, CareerSummer } from "@/lib/types/content";
import { truncate } from "@/server/ai/sanitize";
import { SUMMER_OFFICE_PROGRAMS } from "@/server/content/career-activities";
import { CAREERS } from "@/server/content/careers";
import { getProgram, OFFICES, PROGRAMS } from "@/server/content/offices";

/**
 * The summer options the AI summer picks may choose from (owner request, 2026-11-02; server/ai/features/
 * career-summers.ts). Built only from sourced content, in this order:
 *
 *   1. this path's own Summers entries (server/content/career-activities.ts, as the page's Summers card shows them);
 *   2. every other path's Summers entries, each once, with the paths that list it;
 *   3. the Davidson office programs that are a summer option for any path (SUMMER_OFFICE_PROGRAMS).
 *
 * Each option has a stable id ("program:<slug>" for an office program, "outside:<name as a slug>" for a national
 * program) that the model copies; everything a student sees about an option (`option`: name, page, who it is for,
 * timing or deadlines, source, verifiedAt) is the content's, resolved through the careers page's own resolveSummers,
 * so an AI pick and the Summers card can never disagree. `about` is the one line the model reads about it: the
 * career entry's description (this path's when it has one), or for an office program no path lists, the
 * program's own published description cut to ABOUT_MAX characters. The model never sees a URL.
 */

export interface SummerCatalogEntry {
  option: SummerOption;
  /** What the option is, for the model only (see the module comment). */
  about: string;
  /** Who runs it, in the words of the row's "via" note: the source's label, the office's name or the organization. */
  runBy: string;
  /** The published amount of an office program (null for outside programs and when none is published). */
  amount: string | null;
  /** Names of the career paths whose Summers card lists it (this path's included). */
  listedFor: string[];
}

export const ABOUT_MAX = 280;

/** "NSF Research Experiences for Undergraduates (REU)" → "nsf-research-experiences-for-undergraduates-reu". */
export function optionSlug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function summerEntryId(entry: CareerSummer): string {
  return entry.kind === "program"
    ? `program:${entry.program}`
    : `outside:${optionSlug(entry.name)}`;
}

function optionOf(view: SummerView, id: string, onThisPage: boolean): SummerOption {
  return {
    id,
    name: view.name,
    url: view.url,
    audience: view.audience,
    timing: view.timing,
    source: view.source,
    officeName: view.officeName,
    by: view.by,
    verifiedAt: view.verifiedAt,
    onThisPage,
  };
}

/** The catalog for one career path (see the module comment). Pure over the loaded content. */
export function summerCatalog(
  career: Pick<Career, "slug" | "summer">,
  careers: readonly Pick<Career, "slug" | "name" | "summer">[] = CAREERS,
): SummerCatalogEntry[] {
  const byId = new Map<string, SummerCatalogEntry>();
  const add = (entry: CareerSummer, careerName: string | null, onThisPage: boolean) => {
    const id = summerEntryId(entry);
    const known = byId.get(id);
    if (known) {
      if (careerName && !known.listedFor.includes(careerName)) known.listedFor.push(careerName);
      return;
    }
    const [view] = resolveSummers([entry], PROGRAMS, OFFICES);
    if (!view) return;
    const program = entry.kind === "program" ? getProgram(entry.program) : undefined;
    byId.set(id, {
      option: optionOf(view, id, onThisPage),
      runBy: view.officeName ?? (view.source ? SOURCES[view.source].label : (view.by ?? view.name)),
      about: truncate(view.description, ABOUT_MAX),
      amount: program?.amount ?? null,
      listedFor: careerName ? [careerName] : [],
    });
  };

  const own = careers.find((c) => c.slug === career.slug);
  for (const entry of career.summer ?? []) add(entry, own?.name ?? null, true);
  for (const other of careers) {
    if (other.slug === career.slug) continue;
    for (const entry of other.summer ?? []) add(entry, other.name, false);
  }
  for (const slug of SUMMER_OFFICE_PROGRAMS) {
    const program = getProgram(slug);
    if (!program) throw new Error(`server/content/career-activities: unknown program "${slug}"`);
    add({ kind: "program", program: slug, description: program.description }, null, false);
  }
  return [...byId.values()];
}
