import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ProgramOfferingKind } from "@/lib/types/catalog";
import type { Career } from "@/lib/types/content";
import { foldText } from "@/server/content/define";
import { MissingFixtureError } from "@/server/http/fixtures";
import { programPublicUrl } from "@/server/programs/catalog-info";
import { catalogRowsForRequest, type CatalogRow } from "@/server/programs/service";

/**
 * A career's related programs under their official Acalog names ("Major in Computer Science (B.S. Degree)"), each
 * with its public catalog page (server/programs, W1b; PLAN §3 /careers/[slug]).
 *
 * The career content names the programs by Acalog id and kind. The public programs API (listPrograms) returns
 * names but no page URL yet, so this reads the same rows it does (catalogRows: the synced list, or the checked-in
 * snapshot before the first sync; never the network) and builds the URL with programPublicUrl (contractRequest:
 * a `url` on AcademicProgramSummary). When the programs cannot be read, the career's own verified names are shown
 * without a link: never a guessed one.
 */

export interface RelatedProgramView {
  acalogId: number;
  /** The official offering name, or the career content's name when Acalog cannot be read. */
  name: string;
  kind: Career["relatedPrograms"][number]["type"];
  /** The public catalog page; null without an official match. */
  url: string | null;
  /** True when the name and URL come from the Acalog catalog (tag COURSE CATALOG). */
  official: boolean;
}

const KINDS: Record<Career["relatedPrograms"][number]["type"], readonly ProgramOfferingKind[]> = {
  major: ["major"],
  minor: ["minor", "interdisciplinary-minor"],
  "interdisciplinary-minor": ["interdisciplinary-minor", "minor"],
  other: ["other", "concentration"],
};

const KIND_WORD: Record<Career["relatedPrograms"][number]["type"], string> = {
  major: "major",
  minor: "minor",
  "interdisciplinary-minor": "interdisciplinary minor",
  other: "program",
};

/** "Economics minor": how a program is named without Acalog. */
export function fallbackProgramName(program: Career["relatedPrograms"][number]): string {
  return `${program.name} ${KIND_WORD[program.type]}`;
}

/** The subject of an official offering name: "Interdisciplinary Minor in Data Science" → "Data Science". */
export function offeringSubject(name: string): string | null {
  const match =
    /^(?:interdisciplinary )?(?:major|minor|concentration) in (.+?)(?: \([^)]*\))?$/i.exec(
      name.trim(),
    );
  return match ? match[1]! : null;
}

type Row = Pick<CatalogRow, "acalogId" | "legacyId" | "name" | "offerings">;

/**
 * The one offering of an allowed kind, anywhere in the catalog, whose subject is exactly the program's name: for a
 * career that names a program page the catalog no longer lists (an offering moved to another department's page).
 */
function bySubject(program: Career["relatedPrograms"][number], rows: readonly Row[]) {
  const subject = foldText(program.name);
  const kinds = new Set(KINDS[program.type]);
  const found = rows.flatMap((row) =>
    row.offerings
      .filter((offering) => kinds.has(offering.kind))
      .filter((offering) => {
        const name = offeringSubject(offering.name);
        return name !== null && foldText(name) === subject;
      })
      .map((offering) => ({ row, offering })),
  );
  return found.length === 1 ? found[0]! : null;
}

/**
 * Match one related program to its Acalog offering(s): the offerings of that kind on the program's page (the
 * first kind that has any), narrowed to those naming the subject when the page has several. When the catalog no
 * longer lists that page, the single offering of the same kind and subject elsewhere; a page of kind "other" is
 * named by its own catalog heading; else the career's own name.
 */
export function matchOfferings(
  program: Career["relatedPrograms"][number],
  rows: readonly Row[],
): RelatedProgramView[] {
  const row = rows.find((candidate) => candidate.acalogId === program.acalogId);
  if (!row) {
    const moved = bySubject(program, rows);
    if (moved) {
      return [
        {
          acalogId: moved.row.acalogId,
          name: moved.offering.name,
          kind: program.type,
          url: programPublicUrl(moved.row.legacyId),
          official: true,
        },
      ];
    }
  }
  if (row) {
    for (const kind of KINDS[program.type]) {
      const ofKind = row.offerings.filter((offering) => offering.kind === kind);
      if (ofKind.length === 0) continue;
      const subject = foldText(program.name);
      const named = ofKind.filter((offering) => foldText(offering.name).includes(subject));
      const chosen = ofKind.length > 1 && named.length > 0 ? named : ofKind;
      const url = programPublicUrl(row.legacyId);
      return chosen.map((offering) => ({
        acalogId: program.acalogId,
        name: offering.name,
        kind: program.type,
        url,
        official: true,
      }));
    }
    // "other": the career points at a catalog page itself (e.g. the Center for Interdisciplinary Studies), which
    // may have no offerings of its own.
    if (program.type === "other") {
      return [
        {
          acalogId: program.acalogId,
          name: row.name,
          kind: program.type,
          url: programPublicUrl(row.legacyId),
          official: true,
        },
      ];
    }
  }
  return [
    {
      acalogId: program.acalogId,
      name: fallbackProgramName(program),
      kind: program.type,
      url: null,
      official: false,
    },
  ];
}

/** Dedupe by name, keeping the first (a page listed as both "minor" and "interdisciplinary-minor"). */
function uniqueByName(items: RelatedProgramView[]): RelatedProgramView[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

export async function loadRelatedPrograms(career: Career): Promise<RelatedProgramView[]> {
  let rows: CatalogRow[] = [];
  try {
    rows = await catalogRowsForRequest();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    console.error("[careers] could not read the program catalog:", error);
  }
  return uniqueByName(career.relatedPrograms.flatMap((program) => matchOfferings(program, rows)));
}
