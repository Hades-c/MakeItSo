import "server-only";
import { createHash } from "node:crypto";
import type { mongo } from "mongoose";
import { termLabel, type TermCode } from "@/lib/term";
import CatalogMeta from "@/models/CatalogMeta";
import CatalogSection from "@/models/CatalogSection";
import {
  MAX_INVALID_RATIO,
  MIN_INVALID,
  MIN_REFRESH_RATIO,
  UPSTREAM_TIMEOUT_MS,
} from "@/server/catalog/config";
import { invalidateTermMetas, readTermMeta, termKey, type TermNames } from "@/server/catalog/meta";
import { cleanText } from "@/server/catalog/html";
import { linkSections, normalizeSection, type StoredSection } from "@/server/catalog/normalize";
import { invalidateTermIndex } from "@/server/catalog/store";
import {
  fetchAllSections,
  fetchSectionsPage,
  UpstreamSectionSchema,
  type FetchSectionsPage,
} from "@/server/catalog/upstream";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { MissingFixtureError } from "@/server/http/fixtures";
import { recordSync } from "@/server/sync";

/**
 * One term's ingest (PLAN §5 "Catalog ingest"): fetch every page, normalise, guard, replace the term's rows in
 * catalogsections, update CatalogMeta `term:<code>`, and recordSync("course-schedule"). Callers go through
 * server/catalog/refresh.ts (single flight + lease); this function assumes it holds the term's lease.
 *
 * Guard: a term that holds sections is never replaced by an empty result or one below 50% of its size: the rows
 * stay, `lastError` says why, the Sources panel shows the failure, and pages keep "Schedule data as of
 * <lastSuccessAt>". A term with no rows yet (a summer, an unpublished registration term) accepts an empty result.
 *
 * Replacement is upsert-then-delete, so readers never see an empty term; the content hash changes last, and
 * search indexes rebuild when they see the new hash.
 */

export type IngestStatus = "updated" | "unchanged" | "rejected" | "failed";

export interface IngestOutcome {
  term: TermCode;
  status: IngestStatus;
  sectionCount: number;
  courseCount?: number;
  /** Why a refresh failed or was rejected. */
  error?: string;
}

export interface IngestDeps {
  fetchPage: FetchSectionsPage;
  timeoutMs: number;
  signal?: AbortSignal;
}

export const defaultIngestDeps: IngestDeps = {
  fetchPage: fetchSectionsPage,
  timeoutMs: UPSTREAM_TIMEOUT_MS,
};

const WRITE_BATCH = 500;

export function contentHash(sections: readonly StoredSection[]): string {
  const sorted = [...sections].sort((a, b) => (a.crn < b.crn ? -1 : a.crn > b.crn ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

interface Normalised {
  sections: StoredSection[];
  invalid: number;
  names: TermNames;
}

/** Validate and normalise raw upstream items; duplicates (same CRN across pages) keep the first. */
export function normaliseItems(items: readonly unknown[], term: TermCode): Normalised {
  const byCrn = new Map<string, StoredSection>();
  const departments = new Map<string, string>();
  const requirements = new Map<string, string>();
  let invalid = 0;
  for (const item of items) {
    const raw = UpstreamSectionSchema.safeParse(item);
    if (!raw.success) {
      invalid += 1;
      continue;
    }
    const result = normalizeSection(raw.data, term);
    if (!result.ok) {
      invalid += 1;
      console.warn(`[catalog] ${term}: dropped section ${result.crn}: ${result.reason}`);
      continue;
    }
    const { section } = result;
    if (byCrn.has(section.crn)) continue;
    byCrn.set(section.crn, section);
    if (section.subjectName) departments.set(section.subject, section.subjectName);
    for (const requirement of raw.data.grad_requirements ?? []) {
      const name = cleanText(requirement.description);
      const code = requirement.code.trim().toUpperCase();
      const listed: readonly string[] = section.reqCodes ?? [];
      if (name && listed.includes(code)) requirements.set(code, name);
    }
  }
  const sortedNames = (map: Map<string, string>) =>
    [...map].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
  return {
    sections: linkSections([...byCrn.values()]),
    invalid,
    names: { departments: sortedNames(departments), requirements: sortedNames(requirements) },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function recordFailure(
  term: TermCode,
  status: "failed" | "rejected",
  error: string,
  extra: Record<string, unknown> = {},
): Promise<IngestOutcome> {
  const at = now();
  const stored = await CatalogSection.countDocuments({ termCode: term });
  await CatalogMeta.updateOne(
    { key: termKey(term) },
    {
      $set: { lastError: error.slice(0, 500), lastErrorAt: at, lastAttemptAt: at, ...extra },
      $setOnInsert: { kind: "term", termCode: term },
    },
    { upsert: true },
  );
  invalidateTermMetas();
  await recordSync("course-schedule", {
    ok: false,
    count: 0,
    error: `${termLabel(term)}: ${error}`,
    at,
  });
  return { term, status, sectionCount: stored, error };
}

/**
 * Upsert a term's sections, then delete the CRNs that are gone. Rows are written through the driver collection:
 * every field was validated against the Section contract (zod) moments ago, and skipping mongoose's per-document
 * casting keeps a cold load of a full term well under a second. The row shape is models/CatalogSection.ts
 * (absent `reqCodes` = no requirement data, absent `restrictions.eligibleYears` = open to every year).
 */
async function writeSections(term: TermCode, sections: readonly StoredSection[], fetchedAt: Date) {
  for (let i = 0; i < sections.length; i += WRITE_BATCH) {
    const writes: mongo.AnyBulkWriteOperation[] = sections
      .slice(i, i + WRITE_BATCH)
      .map((section) => {
        const { reqCodes, restrictions, ...rest } = section;
        const { eligibleYears, ...flags } = restrictions;
        return {
          updateOne: {
            filter: { termCode: term, crn: section.crn },
            update: {
              $set: {
                ...rest,
                ...(reqCodes ? { reqCodes } : {}),
                restrictions: { ...flags, ...(eligibleYears ? { eligibleYears } : {}) },
                fetchedAt,
                updatedAt: fetchedAt,
              },
              $setOnInsert: { createdAt: fetchedAt },
              ...(reqCodes ? {} : { $unset: { reqCodes: "" } }),
            },
            upsert: true,
          },
        };
      });
    await CatalogSection.collection.bulkWrite(writes, { ordered: false });
  }
  await CatalogSection.deleteMany({
    termCode: term,
    crn: trusted({ $nin: sections.map((section) => section.crn) }),
  });
}

/** Fetch, normalise, guard and store one term. Never throws for upstream problems (except a missing fixture). */
export async function ingestTerm(
  term: TermCode,
  deps: IngestDeps = defaultIngestDeps,
): Promise<IngestOutcome> {
  await getDb();
  const attemptAt = now();
  await CatalogMeta.updateOne(
    { key: termKey(term) },
    { $set: { lastAttemptAt: attemptAt }, $setOnInsert: { kind: "term", termCode: term } },
    { upsert: true },
  );

  let fetched: Awaited<ReturnType<typeof fetchAllSections>>;
  try {
    fetched = await fetchAllSections(term, deps.fetchPage, {
      timeoutMs: deps.timeoutMs,
      ...(deps.signal ? { signal: deps.signal } : {}),
    });
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    return recordFailure(term, "failed", `Upstream request failed: ${errorMessage(error)}`);
  }
  if (fetched.truncated) {
    console.warn(
      `[catalog] ${term}: stopped after ${fetched.pages} full pages; data may be partial`,
    );
  }

  const { sections, invalid, names } = normaliseItems(fetched.items, term);
  if (invalid > Math.max(MIN_INVALID, fetched.items.length * MAX_INVALID_RATIO)) {
    return recordFailure(
      term,
      "failed",
      `${invalid} of ${fetched.items.length} upstream sections were malformed; kept the stored data.`,
    );
  }

  const stored = await CatalogSection.countDocuments({ termCode: term });
  if (stored > 0 && (sections.length === 0 || sections.length < stored * MIN_REFRESH_RATIO)) {
    return recordFailure(
      term,
      "rejected",
      `Upstream returned ${sections.length} sections (had ${stored}); kept the stored data.`,
      { rejectedCount: sections.length },
    );
  }

  const hash = contentHash(sections);
  const previous = await readTermMeta(term);
  const unchanged = previous?.contentHash === hash && stored === sections.length;
  const at = now();
  if (!unchanged) await writeSections(term, sections, at);

  const courseCount = new Set(sections.map((section) => section.courseCode)).size;
  await CatalogMeta.updateOne(
    { key: termKey(term) },
    {
      $set: {
        kind: "term",
        termCode: term,
        sectionCount: sections.length,
        courseCount,
        contentHash: hash,
        data: names,
        pageCount: fetched.pages,
        invalidCount: invalid,
        lastSuccessAt: at,
        lastAttemptAt: at,
        lastError: null,
        lastErrorAt: null,
        rejectedCount: null,
        ...(unchanged ? {} : { fetchedAt: at }),
      },
    },
    { upsert: true },
  );
  invalidateTermMetas();
  if (!unchanged) invalidateTermIndex(term);
  await recordSync("course-schedule", { ok: true, count: sections.length, at });
  return {
    term,
    status: unchanged ? "unchanged" : "updated",
    sectionCount: sections.length,
    courseCount,
  };
}
