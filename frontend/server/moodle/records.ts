import "server-only";
import mongoose from "mongoose";
import {
  checkMoodleFeedUrl,
  MOODLE_PROBLEM_MESSAGES,
  MOODLE_SYNC_MAX_AGE_MS,
  type MoodleProblem,
} from "@/lib/moodle";
import type { MoodleStatus } from "@/lib/types/moodle";
import type { StudentDeadline } from "@/lib/types/plan";
import MoodleConnection from "@/models/MoodleConnection";
import { registerAccountData } from "@/server/account/erasers";
import { validateCourseCodes } from "@/server/catalog";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { ExternalFetchError, fetchExternal } from "@/server/http/external";
import { MissingFixtureError } from "@/server/http/fixtures";
import { consumeRateLimit } from "@/server/http/rate-limit";
import {
  currentMoodleImport,
  endMoodleImport,
  getPlan,
  listDeadlines,
  replaceMoodleDeadlines,
  startMoodleImport,
} from "@/server/plan";
import { isActiveItem } from "@/server/plan/requirements";
import { decryptFeedUrl, encryptFeedUrl, FeedKeyChangedError } from "@/server/moodle/crypto";
import { MoodleFeedError, parseMoodleCalendar, type MoodleEvent } from "@/server/moodle/ics";

/**
 * Moodle calendar import (/syllabi; source "course-site", shown as "Moodle"). A student pastes the calendar
 * export URL Moodle gives them; MakeItSo checks it (lib/moodle.ts), fetches it once to prove it works, stores it
 * encrypted (server/moodle/crypto.ts) and imports its events as plan deadlines (server/plan replaceMoodleDeadlines:
 * deduped and updated by UID, removed when the feed stops listing them). No review step: these are due dates
 * instructors entered in Moodle, not text an AI read.
 *
 * Syncs: on connect, on "Sync now", and lazily (in the background, after the page is sent) when the student
 * opens Today or /syllabi and the last attempt is older than MOODLE_SYNC_MAX_AGE_MS (6 hours). Every sync counts
 * toward MOODLE_SYNCS_PER_HOUR per student, one runs at a time per student (a lease on the connection), the
 * request times out after 10 s and the answer is capped at 1 MB and 500 events (server/moodle/ics.ts).
 *
 * Each connect starts a new import in the plan (server/plan startMoodleImport) and disconnect ends it; a sync reads
 * the import id before the feed and writes only while the plan still has it, and updates the connection only while
 * it still holds the same stored link. So a sync still reading when the student disconnects, reconnects another
 * feed or deletes their account writes nothing, and connecting never takes over another sync's lease.
 *
 * The URL carries the student's Moodle authtoken: it is never logged (fetch errors are logged by kind only),
 * never sent to the browser (MoodleStatus has no URL) and never included in "Download my data".
 */

export const MOODLE_TIMEOUT_MS = 10_000;
export const MOODLE_MAX_BYTES = 1024 * 1024;
export const MOODLE_SYNCS_PER_HOUR = 10;
/** Moodle's "Recent" in "Recent and next 60 days": the last 5 days. Deadlines older than that are history. */
const RECENT_DAYS = 5;
/** How long one sync may hold the lock before another may start (longer than the fetch timeout). */
const LEASE_MS = 60_000;

type Raw = Record<string, unknown>;

function validUserId(userId: string): mongoose.Types.ObjectId | null {
  return /^[a-f0-9]{24}$/.test(userId) ? new mongoose.Types.ObjectId(userId) : null;
}

function ownerOf(userId: string): mongoose.Types.ObjectId {
  const oid = validUserId(userId);
  if (!oid) throw new ApiError(401, "unauthorized", "Sign in again to continue.");
  return oid;
}

function iso(value: unknown): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

// ---- Reading the feed ------------------------------------------------------------------------------------------

type FeedRead =
  { ok: true; events: MoodleEvent[]; capped: number } | { ok: false; problem: MoodleProblem };

/** Fetch and parse the feed. Never throws an error that carries the URL; every failure is a MoodleProblem. */
async function readFeed(url: string, at: Date): Promise<FeedRead> {
  let text: string;
  try {
    ({ data: text } = await fetchExternal("course-site", url, {
      parse: "text",
      timeoutMs: MOODLE_TIMEOUT_MS,
      maxBytes: MOODLE_MAX_BYTES,
      headers: { accept: "text/calendar, text/plain;q=0.5" },
    }));
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    if (!(error instanceof ExternalFetchError)) {
      console.error("[moodle] feed request failed unexpectedly");
      return { ok: false, problem: "unreachable" };
    }
    // The kind and status only: the error's URL and message carry the student's token.
    console.warn(
      `[moodle] feed request failed: ${error.kind}${error.status ? ` ${error.status}` : ""}`,
    );
    if (error.kind === "too_large") return { ok: false, problem: "invalid" };
    // A redirect off Moodle (to a sign-in page) or a refusal: the link no longer opens the calendar.
    if (error.kind === "blocked" || [401, 403, 404].includes(error.status ?? 0)) {
      return { ok: false, problem: "auth" };
    }
    return { ok: false, problem: "unreachable" };
  }
  try {
    const parsed = parseMoodleCalendar(text, at);
    return { ok: true, events: parsed.events, capped: parsed.capped };
  } catch (error) {
    if (!(error instanceof MoodleFeedError)) throw error;
    console.warn(`[moodle] feed is not a usable calendar: ${error.problem}`);
    return { ok: false, problem: error.problem === "auth" ? "auth" : "invalid" };
  }
}

// ---- Course codes ------------------------------------------------------------------------------------------------

/** The course codes in the student's plan (active items, every listing code), for matching Moodle's course names. */
async function planCourseCodes(userId: string): Promise<Set<string>> {
  try {
    const plan = await getPlan(userId);
    return new Set(
      plan.items.filter(isActiveItem).flatMap((item) => [item.courseCode, item.canonicalCode]),
    );
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    console.error("[moodle] could not read the plan's courses; importing without course codes");
    return new Set();
  }
}

/** The course codes a Moodle course name may name ("CSC221-A Fall 2026" → CSC 221A, CSC 221), in order. */
function codeCandidates(category: string | null): string[] {
  if (!category) return [];
  const out: string[] = [];
  for (const match of category
    .toUpperCase()
    .matchAll(/(?<![A-Z])([A-Z]{2,4})[\s_-]*(\d{3})([A-Z]?)(?!\d)/g)) {
    const [, dept, number, suffix] = match;
    for (const code of [`${dept} ${number}${suffix}`, `${dept} ${number}`]) {
      if (!out.includes(code)) out.push(code);
    }
  }
  return out;
}

/** The candidates that are real Davidson courses (any ingested term). A catalog outage: none (no codes, no failure). */
async function catalogCourseCodes(events: readonly MoodleEvent[]): Promise<Set<string>> {
  const candidates = [...new Set(events.flatMap((event) => codeCandidates(event.category)))];
  if (candidates.length === 0) return new Set();
  try {
    return new Set((await validateCourseCodes(candidates)).valid);
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    console.error("[moodle] could not check course names against the catalog");
    return new Set();
  }
}

/**
 * The course a Moodle course name names ("CSC221-A Fall 2026", "202601_CSC_221_A"), or undefined: one of the
 * student's plan courses first, else any real course in the catalog (a class not in the plan yet still says which
 * class it is). "CSC 221A" also tries "CSC 221" (section A).
 */
export function courseCodeFor(
  category: string | null,
  planCodes: ReadonlySet<string>,
  catalogCodes: ReadonlySet<string> = new Set(),
): string | undefined {
  const candidates = codeCandidates(category);
  return (
    candidates.find((code) => planCodes.has(code)) ??
    candidates.find((code) => catalogCodes.has(code))
  );
}

// ---- Status ------------------------------------------------------------------------------------------------------

async function moodleDeadlines(userId: string): Promise<StudentDeadline[]> {
  return (await listDeadlines(userId))
    .filter((deadline) => deadline.origin === "moodle")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title));
}

function statusOf(doc: Raw | null, deadlines: StudentDeadline[]): MoodleStatus {
  return {
    connected: doc !== null,
    connectedAt: doc ? iso(doc.connectedAt) : null,
    lastSyncedAt: doc ? iso(doc.lastSyncedAt) : null,
    lastAttemptAt: doc ? iso(doc.lastAttemptAt) : null,
    problem: doc ? ((doc.problem as MoodleProblem | null | undefined) ?? null) : null,
    capped: doc && typeof doc.capped === "number" ? doc.capped : 0,
    deadlines,
  };
}

export async function getMoodleStatusImpl(userId: string): Promise<MoodleStatus> {
  const oid = ownerOf(userId);
  await getDb();
  const [doc, deadlines] = await Promise.all([
    MoodleConnection.findOne({ userId: oid }).lean(),
    moodleDeadlines(userId),
  ]);
  return statusOf(doc as Raw | null, deadlines);
}

/** Whether the student has connected their Moodle calendar (Today's pointer to /syllabi). */
export async function isMoodleConnectedImpl(userId: string): Promise<boolean> {
  const oid = validUserId(userId);
  if (!oid) return false;
  await getDb();
  return (await MoodleConnection.exists({ userId: oid })) !== null;
}

// ---- Sync --------------------------------------------------------------------------------------------------------

async function countSync(userId: string, at: Date): Promise<boolean> {
  const limit = await consumeRateLimit(
    `moodle-sync:user:${userId}`,
    MOODLE_SYNCS_PER_HOUR,
    3600,
    at,
  );
  return limit.allowed;
}

function tooManySyncs(): ApiError {
  return new ApiError(
    429,
    "rate_limited",
    `MakeItSo checks Moodle at most ${MOODLE_SYNCS_PER_HOUR} times an hour for you. Try again later.`,
  );
}

/** Which connection a sync works for: the plan's import id and the stored link it read (both checked on write). */
interface SyncTarget {
  importId: string;
  feedUrl: string;
}

/**
 * Store a feed's events in the plan and the outcome on the connection. False: the target is no longer the
 * student's connection (disconnected, reconnected or erased while the feed was read), and nothing was written.
 */
async function applyFeed(
  userId: string,
  oid: mongoose.Types.ObjectId,
  target: SyncTarget,
  read: Extract<FeedRead, { ok: true }>,
  at: Date,
): Promise<boolean> {
  const [planCodes, catalogCodes] = await Promise.all([
    planCourseCodes(userId),
    catalogCourseCodes(read.events),
  ]);
  const result = await replaceMoodleDeadlines(
    userId,
    read.events.map((event) => {
      const courseCode = courseCodeFor(event.category, planCodes, catalogCodes);
      return {
        uid: event.uid,
        title: event.title,
        dueAt: event.dueAt,
        ...(courseCode ? { courseCode } : {}),
      };
    }),
    { windowStart: new Date(at.getTime() - RECENT_DAYS * 86_400_000), importId: target.importId },
  );
  if (!result) return false;
  await MoodleConnection.updateOne(
    { userId: oid, feedUrl: target.feedUrl },
    {
      $set: {
        lastAttemptAt: at,
        lastSyncedAt: at,
        problem: null,
        imported: result.imported,
        capped: read.capped + result.capped,
      },
    },
  );
  return true;
}

/**
 * Sync one student's feed now. `manual` (Sync now, connect): over the hourly limit is a 429. Lazy: it is skipped.
 * Another sync already running for the student: this one does nothing. Failures are stored on the connection
 * (`problem`); the imported deadlines are kept until a sync that works says otherwise.
 */
export async function syncMoodleImpl(
  userId: string,
  { manual }: { manual: boolean },
): Promise<MoodleStatus> {
  const oid = ownerOf(userId);
  await getDb();
  const at = now();
  if (!(await MoodleConnection.exists({ userId: oid }))) return getMoodleStatusImpl(userId);
  if (!(await countSync(userId, at))) {
    if (manual) throw tooManySyncs();
    return getMoodleStatusImpl(userId);
  }
  // A work lock on the real clock (not a business time): it must expire even while FIXTURES_NOW is pinned.
  const lockedUntil = new Date(Date.now() + LEASE_MS);
  const doc = (await MoodleConnection.findOneAndUpdate(
    {
      userId: oid,
      $or: [{ syncLeaseUntil: null }, { syncLeaseUntil: trusted({ $lte: new Date() }) }],
    },
    { $set: { syncLeaseUntil: lockedUntil } },
    { returnDocument: "after" },
  ).lean()) as Raw | null;
  if (!doc) return getMoodleStatusImpl(userId);

  try {
    // Read before the feed: an import ended or replaced after this point makes the write below a no-op.
    const importId = await currentMoodleImport(userId);
    if (!importId) return getMoodleStatusImpl(userId);
    const stored = String(doc.feedUrl);
    const target: SyncTarget = { importId, feedUrl: stored };
    let url: string;
    try {
      url = decryptFeedUrl(stored);
    } catch (error) {
      const problem: MoodleProblem =
        error instanceof FeedKeyChangedError ? "key_changed" : "invalid";
      await MoodleConnection.updateOne(
        { userId: oid, feedUrl: stored },
        { $set: { lastAttemptAt: at, problem } },
      );
      return getMoodleStatusImpl(userId);
    }
    const read = await readFeed(url, at);
    if (read.ok) await applyFeed(userId, oid, target, read, at);
    else {
      await MoodleConnection.updateOne(
        { userId: oid, feedUrl: stored },
        { $set: { lastAttemptAt: at, problem: read.problem } },
      );
    }
  } finally {
    await MoodleConnection.updateOne(
      { userId: oid, syncLeaseUntil: lockedUntil },
      { $set: { syncLeaseUntil: null } },
    );
  }
  return getMoodleStatusImpl(userId);
}

/** Why a sync is not worth starting in the background: never connected, tried recently, or only a student can fix it. */
function lazySyncDue(doc: Raw | null, at: Date): boolean {
  if (!doc) return false;
  if (doc.problem === "auth" || doc.problem === "key_changed") return false;
  const last = doc.lastAttemptAt instanceof Date ? doc.lastAttemptAt.getTime() : 0;
  return at.getTime() - last >= MOODLE_SYNC_MAX_AGE_MS;
}

/** The lazy sync (Today, /syllabi): whether the student's feed is due for one. Cheap: one indexed read. */
export async function moodleSyncDueImpl(userId: string): Promise<boolean> {
  const oid = validUserId(userId);
  if (!oid) return false;
  await getDb();
  const doc = await MoodleConnection.findOne(
    { userId: oid },
    { problem: 1, lastAttemptAt: 1 },
  ).lean();
  return lazySyncDue(doc as Raw | null, now());
}

// ---- Connect and disconnect --------------------------------------------------------------------------------------

/** What a failed first fetch means, as the error the connect route answers. Nothing is stored. */
function connectFailure(problem: MoodleProblem): ApiError {
  if (problem === "unreachable") {
    return new ApiError(503, "unavailable", "Moodle did not answer. Try again in a few minutes.");
  }
  if (problem === "auth") {
    return new ApiError(
      400,
      "validation_failed",
      "Moodle did not accept that link. In Moodle, choose Get calendar URL again and copy the new address.",
    );
  }
  return new ApiError(400, "validation_failed", MOODLE_PROBLEM_MESSAGES.invalid);
}

/**
 * Connect (or replace) the student's Moodle feed: check the URL, fetch it once (a link Moodle refuses is never
 * stored), store it encrypted and import its events.
 */
export async function connectMoodleImpl(userId: string, rawUrl: string): Promise<MoodleStatus> {
  const oid = ownerOf(userId);
  const check = checkMoodleFeedUrl(rawUrl);
  if (!check.ok) throw new ApiError(400, "validation_failed", check.problem);
  await getDb();
  const at = now();
  if (!(await countSync(userId, at))) throw tooManySyncs();

  const read = await readFeed(check.url, at);
  if (!read.ok) throw connectFailure(read.problem);
  // A new import first: a sync of the previous link still running now writes nothing.
  const importId = await startMoodleImport(userId);
  const feedUrl = encryptFeedUrl(check.url);
  // Another sync's lease is left alone: it ends (writing nothing) on its own.
  await MoodleConnection.updateOne(
    { userId: oid },
    { $set: { feedUrl, connectedAt: at }, $setOnInsert: { userId: oid } },
    { upsert: true },
  );
  if (!(await applyFeed(userId, oid, { importId, feedUrl }, read, at))) {
    // Disconnected (or connected again) while this connect was under way: the later choice stands.
    await MoodleConnection.deleteOne({ userId: oid, feedUrl });
  }
  return getMoodleStatusImpl(userId);
}

/** Forget the feed URL; with `removeDeadlines`, also remove the Moodle deadlines from the plan. Idempotent. */
export async function disconnectMoodleImpl(
  userId: string,
  { removeDeadlines }: { removeDeadlines: boolean },
): Promise<{ removed: number }> {
  const oid = ownerOf(userId);
  await getDb();
  // The connection first, then the import: a sync running now can no longer write to either.
  await MoodleConnection.deleteOne({ userId: oid });
  return { removed: await endMoodleImport(userId, { removeDeadlines }) };
}

// ---- Account data (PLAN §4.1.12): "Download my data" and "Delete account" ---------------------------------------
// The imported deadlines are part of the plan ("plans"). The connection is exported without its URL.

registerAccountData("moodle", {
  async export(userId) {
    const oid = validUserId(userId);
    if (!oid) return null;
    await getDb();
    const doc = await MoodleConnection.findOne(
      { userId: oid },
      { feedUrl: 0, syncLeaseUntil: 0 },
    ).lean();
    return doc
      ? {
          ...doc,
          feedUrl: "(your Moodle calendar link is stored encrypted and is not included here)",
        }
      : null;
  },
  async erase(userId) {
    const oid = validUserId(userId);
    if (!oid) return 0;
    await getDb();
    return (await MoodleConnection.deleteMany({ userId: oid })).deletedCount;
  },
});
