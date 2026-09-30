import "server-only";
import { isSyncedSourceId, SOURCES, SYNCED_SOURCE_IDS, type SyncedSourceId } from "@/lib/sources";
import SourceSync from "@/models/SourceSync";
import { getDb } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";

/**
 * Sync bookkeeping for the Sources panel (PLAN §4.1.11). Every job that pulls from an upstream (catalog ingest,
 * feeds, RMP roster, Acalog programs) calls `recordSync` once per source per run; the hub layout calls
 * `getSourceStatuses()` and passes the rows to <SourcesPanel sources>. Only sources that have synced at least once
 * are listed (PLAN §3: no placeholders).
 */

export interface SyncOutcome {
  ok: boolean;
  /** Items in this run (0 on failure). */
  count: number;
  /** Short, non-secret reason on failure (stored truncated to 500 chars). */
  error?: string;
  /** When the run happened (default now). */
  at?: Date;
}

export type SourceSyncState = "ok" | "stale" | "error";

/** Structurally a `SyncedSource` for components/app/sources-panel.tsx, plus diagnostics. */
export interface SourceStatus {
  id: SyncedSourceId;
  label: string;
  /** Last successful sync; null when every attempt so far failed. */
  lastSync: Date | null;
  lastAttemptAt: Date | null;
  status: SourceSyncState;
  /** Items in the last successful sync. */
  count: number;
  /** Last failure reason while the source is failing; null when the last attempt succeeded. */
  error: string | null;
}

/** A source whose last success is older than this is shown as "out of date". */
export const SYNC_MAX_AGE_MS: Readonly<Record<SyncedSourceId, number>> = {
  // Active + registration terms refresh every 15 minutes.
  "course-schedule": 60 * 60_000,
  // Weekly jobs.
  catalog: 8 * 24 * 60 * 60_000,
  ratemyprofessors: 8 * 24 * 60 * 60_000,
  // Feeds are cached 30-60 minutes.
  wildcatsync: 3 * 60 * 60_000,
  "hurt-hub": 3 * 60 * 60_000,
  library: 3 * 60 * 60_000,
  davidsonian: 12 * 60 * 60_000,
  "events-digest": 8 * 24 * 60 * 60_000,
  "davidson-news": 12 * 60 * 60_000,
};

const MAX_ERROR_LENGTH = 500;

/** Record one sync run for a source (atomic upsert). */
export async function recordSync(sourceId: SyncedSourceId, outcome: SyncOutcome): Promise<void> {
  if (!isSyncedSourceId(sourceId)) throw new TypeError(`Not a synced source: ${String(sourceId)}`);
  if (!Number.isInteger(outcome.count) || outcome.count < 0) {
    throw new TypeError(`recordSync(${sourceId}): count must be a non-negative integer`);
  }
  await getDb();
  const at = outcome.at ?? new Date();
  const update = outcome.ok
    ? {
        $set: {
          lastAttemptAt: at,
          lastSuccessAt: at,
          lastCount: outcome.count,
          ok: true,
          consecutiveFailures: 0,
          lastError: null,
        },
      }
    : {
        $set: {
          lastAttemptAt: at,
          lastErrorAt: at,
          lastError: (outcome.error ?? "Unknown error").slice(0, MAX_ERROR_LENGTH),
          ok: false,
        },
        $inc: { consecutiveFailures: 1 },
      };
  const write = () => SourceSync.updateOne({ sourceId }, update, { upsert: true });
  try {
    await write();
  } catch (error) {
    // Two first-ever syncs of a source can race on the upsert; the loser retries as an update.
    if (!isDuplicateKeyError(error)) throw error;
    await write();
  }
}

/** Every source that has synced at least once, in registry order, with its display state. */
export async function getSourceStatuses(now: Date = new Date()): Promise<SourceStatus[]> {
  await getDb();
  const docs = await SourceSync.find({}).lean();
  const byId = new Map(docs.map((doc) => [doc.sourceId, doc]));
  const rows: SourceStatus[] = [];
  for (const id of SYNCED_SOURCE_IDS) {
    const doc = byId.get(id);
    if (!doc) continue;
    const lastSync = doc.lastSuccessAt ?? null;
    const status: SourceSyncState = !doc.ok
      ? "error"
      : lastSync && now.getTime() - lastSync.getTime() > SYNC_MAX_AGE_MS[id]
        ? "stale"
        : "ok";
    rows.push({
      id,
      label: SOURCES[id].label,
      lastSync,
      lastAttemptAt: doc.lastAttemptAt ?? null,
      status,
      count: doc.lastCount ?? 0,
      error: doc.ok ? null : (doc.lastError ?? null),
    });
  }
  return rows;
}
