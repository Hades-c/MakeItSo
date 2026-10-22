import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type AcalogProgramDetail,
  AcalogProgramDetailSchema,
  type AcalogProgramListItem,
  AcalogProgramListSchema,
  isPublicProgram,
} from "@/server/programs/upstream";

/**
 * Recorded Acalog data for the programs tests (no network).
 *
 *   - The program list: the catalog fixture tests/fixtures/external/catalog/programs.json (52 programs).
 *   - Every program page of the 2026-2027 catalog: tests/programs/recorded/catalog-4-program-pages.ndjson, one
 *     page per line, from https://catalog.davidson.edu/widget-api/catalog/4/program/{id} on 2026-09-30 (the same
 *     capture as the fixtures: pages 172, 174 and 188 are equal to them). Each page is trimmed to the fields
 *     server/programs/upstream.ts reads (ids, names, stamps, status, program types, descriptions, and each core's
 *     name, description, status, sort order, courses {id, title, status, sort order}, adhocs {content, placement,
 *     course-id} and children); descriptions and titles are verbatim.
 */

const ROOT = process.cwd();
const FIXTURES = path.join(ROOT, "tests", "fixtures", "external", "catalog");
const PAGES_FILE = path.join(
  ROOT,
  "tests",
  "programs",
  "recorded",
  "catalog-4-program-pages.ndjson",
);

export function fixtureJson(file: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8")) as unknown;
}

export const RECORDED_LIST: readonly AcalogProgramListItem[] = AcalogProgramListSchema.parse(
  fixtureJson("programs.json"),
)["program-list"];

/** Names of the list's public programs (the parser's `otherProgramNames`). */
export const PUBLIC_NAMES: readonly string[] = RECORDED_LIST.filter(isPublicProgram).map(
  (item) => item.name,
);

let pages: Map<number, AcalogProgramDetail> | null = null;

/** Every recorded program page by Acalog id. */
export function recordedPages(): ReadonlyMap<number, AcalogProgramDetail> {
  pages ??= new Map(
    readFileSync(PAGES_FILE, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const page = AcalogProgramDetailSchema.parse(JSON.parse(line));
        return [page.id, page] as const;
      }),
  );
  return pages;
}

export function recordedPage(id: number): AcalogProgramDetail {
  const page = recordedPages().get(id);
  if (!page) throw new Error(`No recorded page for program ${id}`);
  return page;
}

/** A recorded page as the raw JSON Acalog sent (for fetchers that answer a program URL). */
export function recordedPageJson(id: number): string {
  const line = readFileSync(PAGES_FILE, "utf8")
    .split("\n")
    .find((candidate) => candidate.startsWith(`{"id":${id},`));
  if (!line) throw new Error(`No recorded page for program ${id}`);
  return line;
}
