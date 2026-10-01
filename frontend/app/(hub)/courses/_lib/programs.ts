import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ProgramOfferingKind } from "@/lib/types/catalog";
import { normalizeCourseCode } from "@/lib/types/common";
import { MissingFixtureError } from "@/server/http/fixtures";
import { programPublicUrl } from "@/server/programs/catalog-info";
import { catalogRows, type CatalogRow } from "@/server/programs/service";

/**
 * "Also counts for" (PLAN §3 /courses/[term]/[code]): the official Acalog offerings whose requirement text names
 * the course (W1b stores each offering's `courseCodes`). Read from the stored program pages only (catalogRows:
 * the database, never the network), so a course page never fans out to 50 Acalog requests; the line says how
 * many program pages it is based on while the weekly sync has not read them all. contractRequest: a
 * `programsForCourse(codes)` in server/programs (and a `url` on AcademicProgramSummary).
 */

export interface CourseProgramMatch {
  /** Official offering name ("Major in Computer Science (B.S. Degree)"). */
  name: string;
  kind: ProgramOfferingKind;
  /** Public catalog page of the program. */
  url: string;
}

export interface CoursePrograms {
  matches: CourseProgramMatch[];
  /** Program pages whose offerings have been read (detailFetchedAt set). */
  pagesRead: number;
  /** Program pages the catalog lists. */
  pagesTotal: number;
}

type Row = Pick<CatalogRow, "legacyId" | "doc">;

/** Pure: the offerings of the read program pages that list any of `codes`. */
export function programsForCodes(rows: readonly Row[], codes: readonly string[]): CoursePrograms {
  const wanted = new Set(codes.map(normalizeCourseCode));
  const matches: CourseProgramMatch[] = [];
  const seen = new Set<string>();
  let pagesRead = 0;
  for (const row of rows) {
    const doc = row.doc;
    if (!doc?.detailFetchedAt) continue;
    pagesRead += 1;
    for (const offering of doc.offerings ?? []) {
      const listed = (offering.courseCodes ?? []).some((code) =>
        wanted.has(normalizeCourseCode(code)),
      );
      if (!listed || seen.has(offering.name)) continue;
      seen.add(offering.name);
      matches.push({
        name: offering.name,
        kind: offering.kind as ProgramOfferingKind,
        url: programPublicUrl(row.legacyId),
      });
    }
  }
  matches.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return { matches, pagesRead, pagesTotal: rows.length };
}

/** The programs a course counts for; null when the program store cannot be read. */
export async function loadCoursePrograms(codes: readonly string[]): Promise<CoursePrograms | null> {
  try {
    return programsForCodes(await catalogRows(), codes);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MissingFixtureError) throw error;
    console.error("[courses] could not read the programs:", error);
    return null;
  }
}
