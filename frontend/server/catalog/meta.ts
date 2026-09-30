import "server-only";
import { randomUUID } from "node:crypto";
import type { TermCode } from "@/lib/term";
import CatalogMeta from "@/models/CatalogMeta";
import { LEASE_MS, META_MEMO_MS } from "@/server/catalog/config";
import { onCatalogReset } from "@/server/catalog/state";
import { getDb, trusted } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";

/** Per-term ingest state as the rest of server/catalog reads it (CatalogMeta `term:<code>`). */
export interface TermMeta {
  term: TermCode;
  sectionCount: number;
  courseCount: number;
  contentHash: string | null;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  fetchedAt: Date | null;
  /** While a refresh holds the term's lease (real clock). */
  lockUntil: Date | null;
  /** Department and requirement names seen in the term's payload (getCatalogFilters fallback). */
  data: TermNames | null;
}

export interface TermNames {
  departments: { code: string; name: string }[];
  requirements: { code: string; name: string }[];
}

export const termKey = (term: TermCode) => `term:${term}`;

interface MetaMemo {
  byTerm: Map<TermCode, TermMeta>;
  loadedAt: number;
}

let memo: MetaMemo | null = null;
let loading: Promise<MetaMemo> | null = null;
/** Bumped by every invalidation: a load that started before it never becomes the memo. */
let generation = 0;

onCatalogReset(() => {
  memo = null;
  loading = null;
  generation += 1;
});

/** Forget the memoised term metas (after a local refresh wrote one). */
export function invalidateTermMetas(): void {
  memo = null;
  loading = null;
  generation += 1;
}

function toTermMeta(doc: Record<string, unknown> & { termCode?: unknown }): TermMeta {
  const date = (value: unknown) => (value instanceof Date ? value : null);
  const data = doc.data as TermNames | null | undefined;
  return {
    term: String(doc.termCode),
    sectionCount: typeof doc.sectionCount === "number" ? doc.sectionCount : 0,
    courseCount: typeof doc.courseCount === "number" ? doc.courseCount : 0,
    contentHash: typeof doc.contentHash === "string" ? doc.contentHash : null,
    lastSuccessAt: date(doc.lastSuccessAt),
    lastAttemptAt: date(doc.lastAttemptAt),
    lastError: typeof doc.lastError === "string" ? doc.lastError : null,
    lastErrorAt: date(doc.lastErrorAt),
    fetchedAt: date(doc.fetchedAt),
    lockUntil: date(doc.lockUntil),
    data: data && Array.isArray(data.departments) && Array.isArray(data.requirements) ? data : null,
  };
}

async function loadMetas(): Promise<MetaMemo> {
  await getDb();
  const docs = await CatalogMeta.find({ kind: "term" }).lean();
  const byTerm = new Map<TermCode, TermMeta>();
  for (const doc of docs) {
    if (typeof doc.termCode === "string") {
      byTerm.set(doc.termCode, toTermMeta(doc as unknown as Record<string, unknown>));
    }
  }
  return { byTerm, loadedAt: Date.now() };
}

/** Every term's meta, memoised for a few seconds (one query for all terms). */
export async function listTermMetas(): Promise<ReadonlyMap<TermCode, TermMeta>> {
  if (memo && Date.now() - memo.loadedAt < META_MEMO_MS) return memo.byTerm;
  const started = generation;
  const pending = (loading ??= loadMetas());
  try {
    const loaded = await pending;
    if (started === generation) memo = loaded;
    return loaded.byTerm;
  } finally {
    if (loading === pending) loading = null;
  }
}

export async function getTermMeta(term: TermCode): Promise<TermMeta | null> {
  return (await listTermMetas()).get(term) ?? null;
}

/** Read one term's meta straight from the database (no memo). */
export async function readTermMeta(term: TermCode): Promise<TermMeta | null> {
  await getDb();
  const doc = await CatalogMeta.findOne({ key: termKey(term) }).lean();
  return doc ? toTermMeta(doc as unknown as Record<string, unknown>) : null;
}

// ---- Refresh lease ----------------------------------------------------------------------------------------------

const INSTANCE = randomUUID().slice(0, 8);
let leaseCounter = 0;

/**
 * Take the refresh lease of a term (atomic: only when unlocked or expired). Returns the owner token, or null when
 * another refresh (in this or another instance) holds it. Leases expire after LEASE_MS, so a crashed instance
 * never blocks a term for long.
 */
export async function acquireTermLease(term: TermCode): Promise<string | null> {
  await getDb();
  const owner = `${INSTANCE}:${++leaseCounter}`;
  const at = new Date();
  try {
    const doc = await CatalogMeta.findOneAndUpdate(
      {
        key: termKey(term),
        $or: [{ lockUntil: null }, { lockUntil: trusted({ $lt: at }) }],
      },
      {
        $set: { lockUntil: new Date(at.getTime() + LEASE_MS), lockOwner: owner },
        $setOnInsert: { kind: "term", termCode: term },
      },
      { upsert: true, new: true },
    ).lean();
    return doc?.lockOwner === owner ? owner : null;
  } catch (error) {
    // The filter did not match an existing (locked) document, so the upsert collided with it: someone holds it.
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }
}

export async function releaseTermLease(term: TermCode, owner: string): Promise<void> {
  await CatalogMeta.updateOne(
    { key: termKey(term), lockOwner: owner },
    { $set: { lockUntil: null, lockOwner: null } },
  );
}
