import "server-only";
import { z } from "zod";
import {
  type AcademicProgram,
  AcademicProgramSchema,
  type AcademicProgramSummary,
  type ProgramOfferingKind,
} from "@/lib/types/catalog";
import Program, { type ProgramDoc } from "@/models/Program";
import { now as serverNow } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { ApiError, isDuplicateKeyError } from "@/server/http/errors";
import {
  ACALOG_CATALOG,
  PROGRAM_DETAIL_TTL_MS,
  programPublicUrl,
  SYNC_DETAIL_BUDGET_MS,
  SYNC_DETAIL_CONCURRENCY,
} from "@/server/programs/catalog-info";
import { cleanText } from "@/server/programs/html";
import { matchProgramName } from "@/server/programs/names";
import { parseProgramDetail, requirementsTextOf } from "@/server/programs/parse";
import { programSnapshot, type SnapshotProgram } from "@/server/programs/snapshot";
import {
  type AcalogProgramListItem,
  type CatalogFetcher,
  fetchCatalog,
  fetchProgramDetail,
  fetchProgramList,
  isPublicProgram,
} from "@/server/programs/upstream";
import { recordSync } from "@/server/sync";

/**
 * Programs service internals (public surface: server/programs/index.ts). Upstream access and the clock are
 * injectable so tests can simulate WAF challenges, outages and time passing; production uses fetchExternal and
 * server/clock.ts.
 *
 * Where the data comes from:
 *   - which programs exist: the last successful list sync (documents with `listed`), or the checked-in snapshot
 *     until a list sync has succeeded;
 *   - each program's offerings: its parsed page when one was read, else the snapshot's names;
 *   - requirement text: the parsed page only, read on first request and cached for PROGRAM_DETAIL_TTL_MS (a
 *     failed refresh keeps serving the cached copy).
 */

export interface ProgramsDeps {
  fetcher: CatalogFetcher;
  now: () => Date;
}

export const liveDeps: ProgramsDeps = { fetcher: fetchCatalog, now: serverNow };

type ProgramLean = ProgramDoc & { _id: unknown };

interface OfferingName {
  kind: ProgramOfferingKind;
  name: string;
  degree: string | null;
}

/**
 * What the list paths read of a stored program: everything but the requirement text (a department page's sections
 * run to tens of kilobytes; only getProgram needs them, and it loads its one document in full).
 */
const ROW_PROJECTION = { "offerings.sections": 0, descriptionText: 0 } as const;

/** One program as the read paths see it. */
export interface CatalogRow {
  acalogId: number;
  legacyId: number | null;
  name: string;
  code: string;
  offerings: OfferingName[];
  /** The stored document without requirement text (ROW_PROJECTION), when there is one. */
  doc: ProgramLean | null;
  /** The snapshot's entry, when there is one. */
  snapshot: SnapshotProgram | null;
}

export interface ProgramFilter {
  kinds?: readonly ProgramOfferingKind[];
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

function offeringNames(doc: ProgramLean | null, snapshot: SnapshotProgram | null): OfferingName[] {
  if (doc?.detailFetchedAt) {
    return doc.offerings.map((offering) => ({
      kind: offering.kind,
      name: offering.name,
      degree: offering.degree ?? null,
    }));
  }
  return snapshot?.offerings.map((offering) => ({ ...offering })) ?? [];
}

/** Every program of the catalog, sorted by name (see the module comment for where each part comes from). */
export async function catalogRows(): Promise<CatalogRow[]> {
  await getDb();
  const docs = (await Program.find(
    { catalogId: ACALOG_CATALOG.id },
    ROW_PROJECTION,
  ).lean()) as ProgramLean[];
  const snapshot = programSnapshot();
  const snapshotById = new Map(snapshot.programs.map((program) => [program.acalogId, program]));
  const synced = docs.some((doc) => doc.listSyncedAt);
  const rows: CatalogRow[] = [];
  if (synced) {
    for (const doc of docs) {
      if (!doc.listed) continue;
      const snap = snapshotById.get(doc.acalogId) ?? null;
      rows.push({
        acalogId: doc.acalogId,
        legacyId: doc.legacyId ?? null,
        name: doc.name,
        code: doc.code ?? "",
        offerings: offeringNames(doc, snap),
        doc,
        snapshot: snap,
      });
    }
  } else {
    const docById = new Map(docs.map((doc) => [doc.acalogId, doc]));
    for (const snap of snapshot.programs) {
      const doc = docById.get(snap.acalogId) ?? null;
      rows.push({
        acalogId: snap.acalogId,
        legacyId: snap.legacyId,
        name: snap.name,
        code: snap.code,
        offerings: offeringNames(doc, snap),
        doc,
        snapshot: snap,
      });
    }
  }
  return rows.sort(byName);
}

function kindFilter(filter: ProgramFilter): ((kind: ProgramOfferingKind) => boolean) | null {
  if (!filter.kinds || filter.kinds.length === 0) return null;
  const kinds = new Set(filter.kinds);
  return (kind) => kinds.has(kind);
}

export function listProgramsFrom(
  rows: readonly CatalogRow[],
  filter: ProgramFilter = {},
): AcademicProgramSummary[] {
  const keep = kindFilter(filter);
  const out: AcademicProgramSummary[] = [];
  for (const row of rows) {
    const offerings = row.offerings
      .filter((offering) => !keep || keep(offering.kind))
      .map(({ kind, name }) => ({ kind, name }));
    if (keep && offerings.length === 0) continue;
    out.push({
      acalogId: row.acalogId,
      name: row.name,
      catalogYear: ACALOG_CATALOG.year,
      offerings,
    });
  }
  return out;
}

/** Sorted, distinct official names of the given kinds. */
export function namesOf(
  rows: readonly CatalogRow[],
  kinds: readonly ProgramOfferingKind[],
): string[] {
  const wanted = new Set(kinds);
  const names = new Set<string>();
  for (const row of rows) {
    for (const offering of row.offerings) if (wanted.has(offering.kind)) names.add(offering.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

export interface ProgramMatch {
  acalogId: number;
  /** The Acalog page the offering is on ("Genomics & Bioinformatics"). */
  programName: string;
  kind: ProgramOfferingKind;
  /** The official offering name. */
  name: string;
  degree: string | null;
}

export function findIn(
  rows: readonly CatalogRow[],
  input: string,
  kinds?: readonly ProgramOfferingKind[],
): ProgramMatch | null {
  if (input.length > 200) return null;
  const match = matchProgramName(rows, input, kinds);
  if (!match) return null;
  return {
    acalogId: match.program.acalogId,
    programName: match.program.name,
    kind: match.offering.kind,
    name: match.offering.name,
    degree: match.offering.degree,
  };
}

// ---- Program pages -----------------------------------------------------------------------------------------------

/** The contract shape of a stored program page (validated: nothing unparsed leaves the service). */
export function toAcademicProgram(doc: ProgramLean): AcademicProgram {
  return AcademicProgramSchema.parse({
    acalogId: doc.acalogId,
    catalogId: doc.catalogId,
    catalogYear: doc.catalogYear,
    name: doc.name,
    url: doc.url,
    offerings: doc.offerings.map((offering) => ({
      kind: offering.kind,
      name: offering.name,
      degree: offering.degree ?? null,
      requirementsText: requirementsTextOf(offering.sections),
      courseCodes: offering.courseCodes,
    })),
    fetchedAt: (doc.detailFetchedAt ?? doc.fetchedAt).toISOString(),
  });
}

type LoadResult = { ok: true; doc: ProgramLean } | { ok: false; error: string };

const inflight = new Map<number, Promise<LoadResult>>();

/** Upsert that survives two first writes racing on the unique (catalogId, acalogId) index. */
async function upsertProgram(
  acalogId: number,
  update: Record<string, unknown>,
): Promise<ProgramLean | null> {
  const write = () =>
    Program.findOneAndUpdate({ catalogId: ACALOG_CATALOG.id, acalogId }, update, {
      upsert: true,
      new: true,
      lean: true,
    }) as unknown as Promise<ProgramLean | null>;
  try {
    return await write();
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    return write();
  }
}

function insertDefaults(row: CatalogRow, at: Date, listModified: string | null) {
  return {
    catalogYear: ACALOG_CATALOG.year,
    legacyId: row.legacyId,
    name: row.name,
    code: row.code,
    url: programPublicUrl(row.legacyId),
    listed: true,
    listSyncedAt: null,
    listModified,
    fetchedAt: at,
  };
}

async function recordPageError(row: CatalogRow, error: string, at: Date): Promise<void> {
  const setOnInsert: Record<string, unknown> = insertDefaults(
    row,
    at,
    row.snapshot?.modified ?? null,
  );
  await upsertProgram(row.acalogId, {
    $set: { lastDetailError: error.slice(0, 500), lastDetailErrorAt: at },
    $setOnInsert: setOnInsert,
  });
}

/**
 * Read one program page from Acalog, parse it and store it. Single-flight per program within this process. A
 * failure records the error on the document and leaves its last good offerings in place; so does a page that
 * suddenly lists no offerings when it had some.
 */
export function loadProgramPage(
  row: CatalogRow,
  otherProgramNames: readonly string[],
  deps: ProgramsDeps,
): Promise<LoadResult> {
  const pending = inflight.get(row.acalogId);
  if (pending) return pending;
  const run = (async (): Promise<LoadResult> => {
    const result = await fetchProgramDetail(deps.fetcher, row.acalogId);
    const at = deps.now();
    if (!result.ok) {
      await recordPageError(row, result.error, at);
      return result;
    }
    if (!isPublicProgram(result.data)) {
      const error = "Acalog marks this program page as hidden";
      await recordPageError(row, error, at);
      return { ok: false, error };
    }
    const parsed = parseProgramDetail(result.data, { otherProgramNames });
    if (parsed.offerings.length === 0 && row.offerings.length > 0) {
      const error = `The program page lists no majors or minors (the last good copy had ${row.offerings.length})`;
      await recordPageError(row, error, at);
      return { ok: false, error };
    }
    const legacyId = parsed.legacyId ?? row.legacyId;
    const doc = await upsertProgram(row.acalogId, {
      $set: {
        catalogYear: ACALOG_CATALOG.year,
        legacyId,
        name: parsed.name,
        code: parsed.code,
        url: programPublicUrl(legacyId),
        programTypes: parsed.programTypes,
        offerings: parsed.offerings.map((offering) => ({
          kind: offering.kind,
          name: offering.name,
          degree: offering.degree,
          sections: offering.sections,
          courseCodes: offering.courseCodes,
          missingCourseRefs: offering.missingCourseRefs,
          acalogCoreId: offering.acalogCoreId,
        })),
        descriptionText: parsed.descriptionText,
        detailModified: parsed.modified,
        detailFetchedAt: at,
        lastDetailError: null,
        lastDetailErrorAt: null,
        fetchedAt: at,
      },
      $setOnInsert: { listed: true, listSyncedAt: null, listModified: parsed.modified },
    });
    if (!doc) return { ok: false, error: "The program could not be stored" };
    return { ok: true, doc };
  })();
  inflight.set(row.acalogId, run);
  const clear = () => inflight.delete(row.acalogId);
  run.then(clear, clear);
  return run;
}

export const CATALOG_UNAVAILABLE =
  "The Davidson catalog could not be reached, so this program's requirements are not available right now. Try again later.";

/** One program with requirement text; null for a program the catalog does not list. */
export async function getProgramWith(
  acalogId: number,
  deps: ProgramsDeps,
): Promise<AcademicProgram | null> {
  if (!Number.isSafeInteger(acalogId) || acalogId <= 0) return null;
  const rows = await catalogRows();
  const row = rows.find((candidate) => candidate.acalogId === acalogId);
  if (!row) return null;
  const doc = row.doc
    ? ((await Program.findOne({
        catalogId: ACALOG_CATALOG.id,
        acalogId,
      }).lean()) as ProgramLean | null)
    : null;
  if (doc?.detailFetchedAt) {
    const age = deps.now().getTime() - doc.detailFetchedAt.getTime();
    if (age >= 0 && age < PROGRAM_DETAIL_TTL_MS) return toAcademicProgram(doc);
  }
  const loaded = await loadProgramPage(
    row,
    rows.map((candidate) => candidate.name),
    deps,
  );
  if (loaded.ok) return toAcademicProgram(loaded.doc);
  if (doc?.detailFetchedAt) return toAcademicProgram(doc);
  throw new ApiError(503, "unavailable", CATALOG_UNAVAILABLE);
}

// ---- Weekly sync -------------------------------------------------------------------------------------------------

export const ProgramSyncResultSchema = z.object({
  ok: z.boolean(),
  /** Public programs in the list (0 on failure). */
  count: z.number().int().min(0),
  error: z.string().optional(),
  /** Program pages refreshed because Acalog's `modified` stamp changed (failed ones keep their last good copy). */
  pages: z
    .object({
      updated: z.number().int().min(0),
      failed: z.number().int().min(0),
      deferred: z.number().int().min(0),
    })
    .optional(),
});
export type ProgramSyncResult = z.infer<typeof ProgramSyncResultSchema>;

async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await run(item);
    }
  });
  await Promise.all(workers);
}

function listRowUpdate(item: AcalogProgramListItem, at: Date) {
  const legacyId = item["legacy-id"] ?? null;
  return {
    $set: {
      catalogYear: ACALOG_CATALOG.year,
      legacyId,
      name: cleanText(item.name),
      code: cleanText(item.code ?? ""),
      url: programPublicUrl(legacyId),
      programTypes: item.program_types.map((type) => cleanText(type.name)).filter(Boolean),
      listed: true,
      listSyncedAt: at,
      listModified: item.modified,
      fetchedAt: at,
    },
    $setOnInsert: {
      offerings: [],
      descriptionText: "",
      detailModified: null,
      detailFetchedAt: null,
    },
  };
}

/**
 * The weekly refresh (PLAN §6.1 W1b): read the program list; on any failure keep everything as it is and record
 * the error. Otherwise store the list (programs that left it stop being listed) and re-read the pages whose
 * `modified` stamp differs from the copy we have (the stored page, else the snapshot), a few at a time within a
 * time budget. One recordSync("catalog", …) per run.
 */
export async function runProgramSync(deps: ProgramsDeps): Promise<ProgramSyncResult> {
  const startedMs = performance.now();
  await getDb();
  const list = await fetchProgramList(deps.fetcher);
  const at = deps.now();
  if (!list.ok) {
    await recordSync("catalog", { ok: false, count: 0, error: list.error, at });
    return { ok: false, count: 0, error: list.error };
  }

  const items = list.data.filter(isPublicProgram);
  const ids = items.map((item) => item.id);
  const writes = items.map((item) => ({
    updateOne: {
      filter: { catalogId: ACALOG_CATALOG.id, acalogId: item.id },
      update: listRowUpdate(item, at),
      upsert: true,
    },
  }));
  await Program.bulkWrite(writes as unknown as Parameters<typeof Program.bulkWrite>[0], {
    ordered: false,
  });
  await Program.updateMany(
    { catalogId: ACALOG_CATALOG.id, acalogId: trusted({ $nin: ids }) },
    { $set: { listed: false } },
  );

  const rows = await catalogRows();
  const names = rows.map((row) => row.name);
  const changed = rows.filter((row) => {
    const listModified = row.doc?.listModified ?? null;
    const known = row.doc?.detailFetchedAt
      ? (row.doc.detailModified ?? null)
      : (row.snapshot?.modified ?? null);
    return listModified !== null && listModified !== known;
  });

  const pages = { updated: 0, failed: 0, deferred: 0 };
  const failures: string[] = [];
  await eachLimited(changed, SYNC_DETAIL_CONCURRENCY, async (row) => {
    if (performance.now() - startedMs > SYNC_DETAIL_BUDGET_MS) {
      pages.deferred += 1;
      return;
    }
    const result = await loadProgramPage(row, names, deps);
    if (result.ok) pages.updated += 1;
    else {
      pages.failed += 1;
      failures.push(`${row.name}: ${result.error}`);
    }
  });
  if (failures.length > 0) {
    console.warn(
      `[programs] ${failures.length} program page(s) kept their last good copy:`,
      failures,
    );
  }

  await recordSync("catalog", { ok: true, count: items.length, at });
  return { ok: true, count: items.length, pages };
}
