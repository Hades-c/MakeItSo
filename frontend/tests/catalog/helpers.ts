import { readFileSync } from "node:fs";
import path from "node:path";
import { normaliseItems } from "@/server/catalog/ingest";
import type { StoredSection } from "@/server/catalog/normalize";
import { buildTermIndex, entryFromStored, type TermIndex } from "@/server/catalog/store";
import { UpstreamSectionSchema, type UpstreamSection } from "@/server/catalog/upstream";

/**
 * W1 test helpers over the recorded Davidson API responses (tests/fixtures/external/course-schedule): full
 * 202601 + 202602, subsets of 202201–202502.
 */

export const FIXTURE_DIR = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "external",
  "course-schedule",
);

export const FIXTURE_TERMS = [
  "202201",
  "202202",
  "202301",
  "202302",
  "202401",
  "202402",
  "202501",
  "202502",
  "202601",
  "202602",
] as const;

const itemCache = new Map<string, unknown[]>();

/** Raw upstream items of a fixture term. */
export function fixtureItems(term: string): unknown[] {
  let items = itemCache.get(term);
  if (!items) {
    items = JSON.parse(
      readFileSync(path.join(FIXTURE_DIR, `courses-${term}.json`), "utf8"),
    ) as unknown[];
    itemCache.set(term, items);
  }
  return items;
}

/** A raw section by its upstream `display` prefix ("ECO 319 A"). */
export function rawSection(term: string, display: string): UpstreamSection {
  const item = fixtureItems(term).find((candidate) => {
    const shown = (candidate as { display?: string }).display ?? "";
    return shown.startsWith(`${display}:`) || shown.startsWith(`${display} `);
  });
  if (!item) throw new Error(`No fixture section ${display} in ${term}`);
  return UpstreamSectionSchema.parse(item);
}

const sectionCache = new Map<string, StoredSection[]>();

/** Every fixture section of a term, normalised as the ingest does it. */
export function fixtureSections(term: string): StoredSection[] {
  let sections = sectionCache.get(term);
  if (!sections) {
    sections = normaliseItems(fixtureItems(term), term).sections;
    sectionCache.set(term, sections);
  }
  return sections;
}

export function fixtureSection(term: string, code: string, section: string): StoredSection {
  const found = fixtureSections(term).find((s) => s.courseCode === code && s.section === section);
  if (!found) throw new Error(`No fixture section ${code} ${section} in ${term}`);
  return found;
}

/** An in-memory index of a fixture term (no database). */
export function fixtureIndex(term: string): TermIndex {
  return buildTermIndex(term, fixtureSections(term).map(entryFromStored), `fixture-${term}`);
}
