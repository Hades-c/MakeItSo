import "server-only";
import * as z from "zod";
import {
  RMP_TAGS,
  RMP_TOP_TAGS,
  type RmpTag,
  type RmpTagCount,
  type TagSyncResult,
} from "@/lib/types/ratings";
import RmpTagSync from "@/models/RmpTagSync";
import RmpTeacher from "@/models/RmpTeacher";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { ExternalFetchError, fetchExternal } from "@/server/http/external";
import { RMP_GRAPHQL_URL } from "@/server/rmp/roster";

/**
 * Tag counts for rated Davidson teachers (the daily RMP cron, after the roster; server/rmp/cron.ts). RMP's own
 * per-teacher "top tags" (Teacher.teacherRatingTags) comes back empty, so this step counts the fixed tags on each
 * teacher's ratings and stores the five most used per teacher in rmpteachers (topTags, tagRatingsCounted,
 * tagsNumRatings, tagsFetchedAt). It asks for `ratingTags` and the paging fields only: never comments, classes,
 * dates or anything else a student wrote.
 *
 *   POST https://www.ratemyprofessors.com/graphql
 *   query DavidsonTeacherTags($first: Int!, $id9000001: ID!, $after9000001: String, ...) {
 *     t9000001: node(id: $id9000001) { ... on Teacher { ratings(first: $first, after: $after9000001) {
 *       edges { node { ratingTags } } pageInfo { hasNextPage endCursor } } } }
 *     ...one alias per teacher, keyed by legacyId
 *   }
 *
 * - Due: numRatings ≥ 1 and never counted, counted when RMP listed a different numRatings, or counted more than
 *   TAGS_MAX_AGE_DAYS ago; and not waiting out a backoff (below). Work order: never counted first, then the oldest
 *   count, then legacyId.
 * - Up to TAG_BATCH_SIZE teachers per request, TAG_CONCURRENCY requests at a time with a short pause between a
 *   worker's requests; each teacher is paged with its own cursor until RMP reports no next page (TAG_MAX_PAGES at
 *   most: the newest TAG_MAX_PAGES × TAG_PAGE_SIZE ratings are counted).
 * - Tags are normalised (NFKC, spaces collapsed, trimmed, case-insensitive) and kept only when they are one of
 *   RMP's fixed tags (RMP_TAGS); anything else is dropped. A rating counts each tag once.
 * - Resumable: a teacher is written once all of its pages are read (the whole count in one write), so a run cut
 *   short by its time budget, an upstream failure or a crash loses only the teachers in flight, and the next run
 *   starts with them (they are still the oldest).
 * - Time budget: no request starts unless it can time out and be stored before the deadline.
 * - An upstream failure (HTTP error, timeout, a GraphQL error without data, an unexpected shape) stops the run, with
 *   no retries against a failing upstream; the stored counts stay. Every run is recorded in rmptagsyncs
 *   (recordTagSync).
 * - A teacher whose own answer is missing, null, malformed or stuck (a cursor that does not move) is skipped and
 *   marked: tagsFailures + 1 and tagsRetryAt = the run's time + TAG_RETRY_BASE_DAYS × 2^(failures − 1), at most
 *   TAG_RETRY_MAX_DAYS. Until then it is not due, so a few bad teachers at the front of the work order (they stay
 *   "never counted") cannot hold back the rest of the queue run after run; a good count clears both fields. The run
 *   goes on after a batch in which no teacher was usable, and stops only after TAG_MAX_EMPTY_BATCHES of them in a
 *   row (then the upstream, not the teachers, is the problem; those teachers are marked too).
 */

export const TAGS_QUERY_NAME = "DavidsonTeacherTags";
/** Teachers (aliases) per request. */
export const TAG_BATCH_SIZE = 10;
/** Ratings per teacher per request. */
export const TAG_PAGE_SIZE = 100;
/** Pages per teacher per run: a runaway guard (2,000 ratings), far above any Davidson teacher. */
export const TAG_MAX_PAGES = 20;
/** Requests in flight at once. */
export const TAG_CONCURRENCY = 2;
/** Pause between one worker's requests. */
export const TAG_PAUSE_MS = 250;
export const TAG_REQUEST_TIMEOUT_MS = 15_000;
/** Kept free at the end of the budget for the last writes and the run record. */
export const TAG_STORE_RESERVE_MS = 5_000;
/** A count older than this is redone even when the number of ratings did not change. */
export const TAGS_MAX_AGE_DAYS = 30;
/** A teacher with an unusable answer waits this long before it is asked again, doubled per failure in a row... */
export const TAG_RETRY_BASE_DAYS = 1;
/** ...and never longer than this. */
export const TAG_RETRY_MAX_DAYS = TAGS_MAX_AGE_DAYS;
/** Requests in a row without one usable teacher that stop the run. */
export const TAG_MAX_EMPTY_BATCHES = 3;
const TAG_MAX_BYTES = 4 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60_000;

/** RMP's separator inside one rating's ratingTags string. */
export const TAG_SEPARATOR = "--";

// ---- Tags ----------------------------------------------------------------------------------------------------

function tagKey(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

const TAG_BY_KEY: ReadonlyMap<string, RmpTag> = new Map(RMP_TAGS.map((tag) => [tagKey(tag), tag]));

/** One tag as RMP sends it ("Amazing lectures ") → its RMP_TAGS entry, or null when it is not one of them. */
export function normalizeTag(raw: string): RmpTag | null {
  return TAG_BY_KEY.get(tagKey(raw)) ?? null;
}

export interface ParsedRatingTags {
  /** The rating's distinct known tags, in RMP's order. */
  tags: RmpTag[];
  /** Non-empty parts that are not RMP tags (dropped). */
  dropped: number;
}

/** One rating's "--"-separated ratingTags string → its distinct RMP tags; everything else is dropped. */
export function parseRatingTags(value: string | null | undefined): ParsedRatingTags {
  const tags: RmpTag[] = [];
  let dropped = 0;
  for (const part of (value ?? "").split(TAG_SEPARATOR)) {
    if (!part.trim()) continue;
    const tag = normalizeTag(part);
    if (!tag) dropped++;
    else if (!tags.includes(tag)) tags.push(tag);
  }
  return { tags, dropped };
}

/** The most used tags, most used first (ties alphabetically), at most `limit`. */
export function topTags(
  counts: ReadonlyMap<RmpTag, number>,
  limit: number = RMP_TOP_TAGS,
): RmpTagCount[] {
  return [...counts]
    .filter(([, count]) => count > 0)
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b, "en"))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

// ---- Request and response ------------------------------------------------------------------------------------

/** One teacher in a request: the page after `after` (null: the first page). */
export interface TagRequestItem {
  legacyId: number;
  /** RMP's GraphQL node id ("VGVhY2hlci05MDAwMDAx"). */
  rmpId: string;
  after: string | null;
}

/** The GraphQL request body for one batch: one `node` alias per teacher, every value passed as a variable. */
export function tagsRequestBody(items: readonly TagRequestItem[], first: number = TAG_PAGE_SIZE) {
  const declarations = ["$first: Int!"];
  const fields: string[] = [];
  const variables: Record<string, string | number> = { first };
  for (const { legacyId, rmpId, after } of items) {
    if (!Number.isSafeInteger(legacyId) || legacyId <= 0) {
      throw new TypeError(`Not a legacyId: ${String(legacyId)}`);
    }
    declarations.push(`$id${legacyId}: ID!`, `$after${legacyId}: String`);
    fields.push(
      `  t${legacyId}: node(id: $id${legacyId}) {
    ... on Teacher {
      ratings(first: $first, after: $after${legacyId}) {
        edges { node { ratingTags } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`,
    );
    variables[`id${legacyId}`] = rmpId;
    if (after) variables[`after${legacyId}`] = after;
  }
  return {
    query: `query ${TAGS_QUERY_NAME}(${declarations.join(", ")}) {\n${fields.join("\n")}\n}`,
    variables,
  };
}

const RatingsPageSchema = z.object({
  ratings: z.object({
    edges: z.array(
      z
        .object({ node: z.object({ ratingTags: z.string().max(2_000).nullish() }).nullish() })
        .nullish(),
    ),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().max(500).nullish(),
    }),
  }),
});

const TagsResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()).nullish(),
  errors: z
    .array(
      z.object({ message: z.string().catch("(no message)") }).catch({ message: "(no message)" }),
    )
    .nullish(),
});

/** One teacher's page of ratings, reduced to tags. */
export interface TagPage {
  /** Ratings on the page (with or without tags). */
  ratings: number;
  /** The known tags of each rating on the page. */
  tags: RmpTag[][];
  /** Tags dropped because they are not RMP tags. */
  dropped: number;
  hasNextPage: boolean;
  endCursor: string | null;
}

/** A request whose answer cannot be used at all: the run stops (the stored counts stay). */
export class TagsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagsError";
  }
}

/**
 * Validate one batch answer. Per teacher: its page, or null when its alias is missing, null (a GraphQL error on that
 * node) or malformed, even when that is every teacher (the run marks them and goes on). Throws TagsError when the
 * answer as a whole is unusable: not JSON of the GraphQL shape, or no `data` at all.
 */
export function parseTagsResponse(
  data: unknown,
  items: readonly Pick<TagRequestItem, "legacyId">[],
): Map<number, TagPage | null> {
  const parsed = TagsResponseSchema.safeParse(data);
  if (!parsed.success) throw new TagsError("RateMyProfessors answered in an unexpected shape.");
  const { data: nodes, errors } = parsed.data;
  if (!nodes) {
    const message = errors?.[0]?.message.slice(0, 200);
    throw new TagsError(
      message
        ? `RateMyProfessors answered with an error: ${message}`
        : "RateMyProfessors answered without data.",
    );
  }
  const pages = new Map<number, TagPage | null>();
  for (const { legacyId } of items) {
    const node = RatingsPageSchema.safeParse(nodes[`t${legacyId}`]);
    if (!node.success) {
      pages.set(legacyId, null);
      continue;
    }
    const { edges, pageInfo } = node.data.ratings;
    let dropped = 0;
    const tags = edges.map((edge) => {
      const rating = parseRatingTags(edge?.node?.ratingTags);
      dropped += rating.dropped;
      return rating.tags;
    });
    pages.set(legacyId, {
      ratings: edges.length,
      tags,
      dropped,
      hasNextPage: pageInfo.hasNextPage,
      endCursor: pageInfo.endCursor || null,
    });
  }
  return pages;
}

// ---- The run -------------------------------------------------------------------------------------------------

/** Rated teachers whose tags are due at `at` (see the header). */
function dueFilter(at: Date): Record<string, unknown> {
  return {
    numRatings: trusted({ $gte: 1 }),
    $and: [
      {
        $or: [
          { tagsFetchedAt: null },
          { tagsFetchedAt: trusted({ $lt: new Date(at.getTime() - TAGS_MAX_AGE_DAYS * DAY_MS) }) },
          { $expr: trusted({ $ne: ["$tagsNumRatings", "$numRatings"] }) },
        ],
      },
      { $or: [{ tagsRetryAt: null }, { tagsRetryAt: trusted({ $lte: at }) }] },
    ],
  };
}

/** When a teacher with `failures` unusable answers in a row (this one included) is asked again. */
export function tagRetryAt(at: Date, failures: number): Date {
  const days = Math.min(TAG_RETRY_MAX_DAYS, TAG_RETRY_BASE_DAYS * 2 ** Math.max(0, failures - 1));
  return new Date(at.getTime() + days * DAY_MS);
}

const DueTeacherSchema = z.object({
  legacyId: z.number().int().positive(),
  rmpId: z.string().min(1).max(200),
  numRatings: z.number().int().min(1),
  tagsFailures: z
    .number()
    .int()
    .min(0)
    .nullish()
    .transform((value) => value ?? 0),
});

interface Work {
  legacyId: number;
  rmpId: string;
  numRatings: number;
  /** Unusable answers in a row before this run. */
  tagsFailures: number;
  after: string | null;
  pages: number;
  ratings: number;
  counts: Map<RmpTag, number>;
}

export interface TagSyncOptions {
  /** How long the run may take, from its start: no request is still running after it. */
  budgetMs: number;
  /** Monotonic milliseconds (default performance.now): a work limit, not a business clock. */
  clock?: () => number;
  batchSize?: number;
  concurrency?: number;
  pageSize?: number;
  maxPages?: number;
  pauseMs?: number;
  requestTimeoutMs?: number;
}

const FETCH_FAILURES: Readonly<Record<ExternalFetchError["kind"], string>> = {
  blocked: "The RateMyProfessors request was blocked (host allow-list).",
  timeout: "RateMyProfessors timed out.",
  network: "Could not reach RateMyProfessors.",
  http: "RateMyProfessors answered with an HTTP error.",
  too_large: "The RateMyProfessors answer was too large.",
  parse: "RateMyProfessors did not answer with JSON (parse error).",
  invalid: "RateMyProfessors answered in an unexpected shape.",
};

function failureMessage(error: ExternalFetchError | TagsError): string {
  if (!(error instanceof ExternalFetchError)) return error.message;
  return error.kind === "http" && error.status
    ? `RateMyProfessors answered HTTP ${error.status}.`
    : FETCH_FAILURES[error.kind];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Write each finished teacher's whole count (one $set per teacher, which clears any backoff), and mark each
 * teacher whose answer was unusable (its stored count, if any, stays).
 */
async function storeCounts(
  done: readonly Work[],
  unusable: readonly Work[],
  at: Date,
): Promise<void> {
  if (done.length === 0 && unusable.length === 0) return;
  const counted = done.map((work) => ({
    updateOne: {
      filter: { legacyId: work.legacyId, rmpId: work.rmpId },
      update: {
        $set: {
          topTags: topTags(work.counts),
          tagRatingsCounted: work.ratings,
          tagsNumRatings: work.numRatings,
          tagsFetchedAt: at,
          tagsFailures: 0,
          tagsRetryAt: null,
        },
      },
    },
  }));
  const marked = unusable.map((work) => ({
    updateOne: {
      filter: { legacyId: work.legacyId, rmpId: work.rmpId },
      update: {
        $set: {
          tagsFailures: work.tagsFailures + 1,
          tagsRetryAt: tagRetryAt(at, work.tagsFailures + 1),
        },
      },
    },
  }));
  const writes = [...counted, ...marked];
  // Mongoose types an array $set as a DocumentArray; a plain array of {tag, count} is what it casts and stores.
  await RmpTeacher.bulkWrite(writes as unknown as Parameters<typeof RmpTeacher.bulkWrite>[0], {
    ordered: false,
  });
}

/** Record one tag run (atomic upsert of the single rmptagsyncs document). */
export async function recordTagSync(result: TagSyncResult, at: Date): Promise<void> {
  await getDb();
  const counts = {
    lastAttemptAt: at,
    lastUpdated: result.updated,
    lastSkipped: result.skipped,
    lastRequests: result.requests,
    remaining: result.remaining,
    outOfTime: result.outOfTime,
  };
  const update = result.ok
    ? {
        $set: { ...counts, lastSuccessAt: at, ok: true, consecutiveFailures: 0, lastError: null },
      }
    : {
        $set: {
          ...counts,
          lastErrorAt: at,
          lastError: (result.error ?? "Unknown error").slice(0, 500),
          ok: false,
        },
        $inc: { consecutiveFailures: 1 },
      };
  await RmpTagSync.updateOne({ key: "tags" }, update, { upsert: true });
}

const STORE_FAILURE = "Could not store the RateMyProfessors tag counts.";

/**
 * Count the tags of the due teachers within `budgetMs` (callers check RMP_ENABLED; see server/rmp/cron.ts).
 * Upstream failures end the run early and come back as `{ ok: false }`; database failures are recorded (when the
 * database still takes the record) and rethrown. MissingFixtureError and programming errors propagate.
 */
export async function runTagSync(options: TagSyncOptions): Promise<TagSyncResult> {
  const clock = options.clock ?? (() => performance.now());
  const deadline = clock() + Math.max(0, options.budgetMs);
  const batchSize = Math.max(1, options.batchSize ?? TAG_BATCH_SIZE);
  const concurrency = Math.max(1, options.concurrency ?? TAG_CONCURRENCY);
  const pageSize = options.pageSize ?? TAG_PAGE_SIZE;
  const maxPages = options.maxPages ?? TAG_MAX_PAGES;
  const pauseMs = options.pauseMs ?? TAG_PAUSE_MS;
  const timeoutMs = options.requestTimeoutMs ?? TAG_REQUEST_TIMEOUT_MS;
  const runAt = now();

  const queue: Work[] = [];
  try {
    await getDb();
    const docs: unknown[] = await RmpTeacher.find(dueFilter(runAt))
      .sort({ tagsFetchedAt: 1, legacyId: 1 })
      .select("legacyId rmpId numRatings tagsFailures")
      .lean();
    for (const doc of docs) {
      const teacher = DueTeacherSchema.safeParse(doc);
      if (teacher.success) {
        queue.push({ ...teacher.data, after: null, pages: 0, ratings: 0, counts: new Map() });
      }
    }
  } catch (error) {
    await recordStoreFailure(runAt);
    throw error;
  }

  /** Teachers with more pages to read: they go before new ones. */
  const continuing: Work[] = [];
  let requests = 0;
  let updated = 0;
  let skipped = 0;
  let dropped = 0;
  /** Requests in a row whose answer had no usable teacher (TAG_MAX_EMPTY_BATCHES stops the run). */
  let emptyBatches = 0;
  let outOfTime = false;
  let failure: string | null = null;
  /** A database failure (recorded) or anything unexpected, e.g. a MissingFixtureError (not recorded): rethrown. */
  let fatal: { error: unknown; store: boolean } | null = null;

  const takeBatch = (): Work[] => {
    const batch = continuing.splice(0, batchSize);
    if (batch.length < batchSize) batch.push(...queue.splice(0, batchSize - batch.length));
    return batch;
  };

  const worker = async (index: number): Promise<void> => {
    // Start the workers a pause apart, not in a burst.
    if (index > 0 && pauseMs > 0) await sleep(pauseMs * index);
    for (let first = true; ; first = false) {
      if (failure || fatal) return;
      if (!first && pauseMs > 0) await sleep(pauseMs);
      if (continuing.length === 0 && queue.length === 0) return;
      if (clock() + timeoutMs + TAG_STORE_RESERVE_MS > deadline) {
        outOfTime = true;
        return;
      }
      const batch = takeBatch();
      if (batch.length === 0) return;
      requests++;
      let pages: Map<number, TagPage | null>;
      try {
        const res = await fetchExternal("ratemyprofessors", RMP_GRAPHQL_URL, {
          method: "POST",
          body: tagsRequestBody(batch, pageSize),
          timeoutMs,
          maxBytes: TAG_MAX_BYTES,
        });
        pages = parseTagsResponse(res.data, batch);
      } catch (error) {
        if (error instanceof ExternalFetchError || error instanceof TagsError) {
          failure ??= failureMessage(error);
        } else fatal ??= { error, store: false };
        return;
      }

      const done: Work[] = [];
      const unusable: Work[] = [];
      emptyBatches = batch.some((work) => pages.get(work.legacyId)) ? 0 : emptyBatches + 1;
      for (const work of batch) {
        const page = pages.get(work.legacyId);
        // A cursor that does not move would page forever: skip the teacher, like a missing answer.
        const stuck = page?.hasNextPage && (!page.endCursor || page.endCursor === work.after);
        if (!page || stuck) {
          skipped++;
          unusable.push(work);
          continue;
        }
        work.pages++;
        work.ratings += page.ratings;
        dropped += page.dropped;
        for (const tags of page.tags) {
          for (const tag of tags) work.counts.set(tag, (work.counts.get(tag) ?? 0) + 1);
        }
        if (page.hasNextPage && work.pages < maxPages) {
          work.after = page.endCursor;
          continuing.push(work);
        } else done.push(work);
      }
      try {
        await storeCounts(done, unusable, runAt);
        updated += done.length;
      } catch (error) {
        fatal ??= { error, store: true };
        return;
      }
      if (emptyBatches >= TAG_MAX_EMPTY_BATCHES) {
        failure ??= `RateMyProfessors answered without any of the requested teachers (${emptyBatches} requests in a row).`;
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
  if (fatal) {
    const { error, store } = fatal as { error: unknown; store: boolean };
    if (store) await recordStoreFailure(runAt);
    throw error;
  }

  if (skipped > 0) {
    console.warn(
      `[rmp] tags: skipped ${skipped} teacher(s) with an unusable answer; each is asked again after a backoff`,
    );
  }
  if (dropped > 0) console.warn(`[rmp] tags: dropped ${dropped} tag(s) outside RMP's fixed list`);

  let remaining: number;
  try {
    remaining = await RmpTeacher.countDocuments(dueFilter(runAt));
  } catch (error) {
    await recordStoreFailure(runAt);
    throw error;
  }
  const result: TagSyncResult = {
    ok: failure === null,
    updated,
    skipped,
    remaining,
    requests,
    outOfTime: outOfTime && remaining > 0,
    ...(failure ? { error: failure } : {}),
  };
  await recordTagSync(result, runAt);
  return result;
}

async function recordStoreFailure(at: Date): Promise<void> {
  await recordTagSync(
    {
      ok: false,
      updated: 0,
      skipped: 0,
      remaining: 0,
      requests: 0,
      outOfTime: false,
      error: STORE_FAILURE,
    },
    at,
  ).catch(() => undefined);
}
