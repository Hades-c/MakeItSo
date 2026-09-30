import "server-only";
import { z } from "zod";
import {
  FEED_SOURCE_IDS,
  FeedSourceIdSchema,
  type FeedSourceId,
  type FeedSyncResult,
} from "@/lib/types/feeds";
import SourceSync from "@/models/SourceSync";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { readEnv } from "@/server/env";
import { FEED_SOURCES, HURT_HUB_TRIBE_URL, type FeedChannel } from "@/server/feeds/config";
import { normalizeDigest } from "@/server/feeds/digest";
import { parseIcs } from "@/server/feeds/ics";
import { LibCalHoursTodaySchema, libCalDate, normalizeLibraryHours } from "@/server/feeds/libcal";
import { normalizeNews, parseRss } from "@/server/feeds/rss";
import { storeChannelItems, type PruneScope } from "@/server/feeds/store";
import { dateKeyInZone } from "@/server/feeds/time";
import { normalizeTribeEvents, TribePageSchema, type TribePage } from "@/server/feeds/tribe";
import { FeedParseError, type NormalizedFeedItem } from "@/server/feeds/types";
import { safeItemUrl, urlDedupeKey } from "@/server/feeds/urls";
import { ApiError } from "@/server/http/errors";
import { ExternalFetchError, fetchExternal } from "@/server/http/external";
import { MissingFixtureError } from "@/server/http/fixtures";
import { recordSync } from "@/server/sync";

/**
 * Feed sync (PLAN §6.1 W4a): fetch → parse → normalise → dedupe → store, one source at a time, failures isolated
 * per source (and per channel inside a source). Every run of a source ends with exactly one
 * `recordSync(source, { ok, count, error })`:
 *   - ok: every channel of the source succeeded (Hurt Hub counts as ok when the Tribe fallback saved it);
 *   - count: the items stored in this run;
 *   - a failed channel keeps its last good items untouched (nothing is written or pruned for it).
 * MissingFixtureError (a test without a fixture) is never caught.
 */

/** Feed payload cap (the Events Digest archive is ~1.6 MB with ten full newsletters). */
export const FEED_MAX_BYTES = 5 * 1024 * 1024;
const TRIBE_MAX_PAGES = 4;

export const SyncFeedsOptionsSchema = z
  .object({
    /** Sources to sync (default: all six feed sources). */
    sources: z.array(FeedSourceIdSchema).optional(),
    /** Skip sources synced (attempted) within their freshness window (30–60 min). */
    onlyStale: z.boolean().optional(),
  })
  .strict();
export type SyncFeedsOptions = z.input<typeof SyncFeedsOptionsSchema>;

interface ChannelOutcome {
  channel: FeedChannel;
  items: NormalizedFeedItem[];
  scope: PruneScope;
  /** Fallback note ("iCal failed: …; used the Tribe API"). */
  note?: string;
}

function campusTimeZone(): string {
  return readEnv("APP_TIMEZONE");
}

/** A channel failure whose message is already a short description (both Hurt Hub paths failed). */
class ChannelFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChannelFailure";
  }
}

/** Short, non-secret description of a failure for recordSync / the cron response. */
export function describeFailure(error: unknown): string {
  if (error instanceof ChannelFailure) return error.message;
  if (error instanceof ExternalFetchError) {
    return error.status
      ? `HTTP ${error.status} (${error.kind})`
      : `${error.kind}: ${error.message}`;
  }
  if (error instanceof FeedParseError) return `parse: ${error.message}`;
  if (error instanceof z.ZodError) return "invalid payload";
  return "unexpected error";
}

async function fetchText(source: FeedSourceId, url: string): Promise<string> {
  const { data } = await fetchExternal(source, url, { parse: "text", maxBytes: FEED_MAX_BYTES });
  return data;
}

async function fetchTribeEvents(todayKey: string): Promise<unknown[]> {
  const events: unknown[] = [];
  let url: string | null =
    `${HURT_HUB_TRIBE_URL}?per_page=50&start_date=${encodeURIComponent(todayKey)}`;
  for (let page = 0; url && page < TRIBE_MAX_PAGES; page++) {
    const { data }: { data: TribePage } = await fetchExternal("hurt-hub", url, {
      parse: "json",
      schema: TribePageSchema,
      maxBytes: FEED_MAX_BYTES,
    });
    events.push(...data.events);
    const next: string | null = data.next_rest_url
      ? safeItemUrl("hurt-hub", data.next_rest_url)
      : null;
    url = next && next !== url ? next : null;
  }
  return events;
}

async function runChannel(
  source: FeedSourceId,
  channel: FeedChannel,
  at: Date,
  timeZone: string,
): Promise<ChannelOutcome> {
  const context = { source, channel: channel.channel, now: at, timeZone };
  const upcoming: PruneScope = { kind: "upcoming", now: at };
  switch (channel.format) {
    case "ics": {
      const fallbackUrl = channel.fallbackUrl ?? "";
      try {
        const text = await fetchText(source, channel.url);
        const { items } = parseIcs(text, {
          ...context,
          fallbackUrl,
          externalIdFor: channel.externalIdFor,
          cleanDescription: channel.cleanDescription,
        });
        return { channel, items, scope: upcoming };
      } catch (error) {
        if (error instanceof MissingFixtureError || channel.fallback !== "tribe") throw error;
        let events: unknown[];
        try {
          events = await fetchTribeEvents(dateKeyInZone(at, timeZone));
        } catch (fallbackError) {
          if (fallbackError instanceof MissingFixtureError) throw fallbackError;
          throw new ChannelFailure(
            `iCal ${describeFailure(error)}; Tribe API ${describeFailure(fallbackError)}`,
          );
        }
        const { items } = normalizeTribeEvents(events, { ...context, fallbackUrl });
        return {
          channel,
          items,
          scope: upcoming,
          note: `iCal failed (${describeFailure(error)}); used the Tribe API`,
        };
      }
    }
    case "rss-news": {
      const rss = parseRss(await fetchText(source, channel.url));
      const { items } = normalizeNews(rss, { ...context, summarize: channel.summarize });
      return { channel, items, scope: { kind: "none" } };
    }
    case "digest": {
      const rss = parseRss(await fetchText(source, channel.url));
      const { items } = normalizeDigest(rss, context);
      return { channel, items, scope: upcoming };
    }
    case "libcal-hours": {
      const { data } = await fetchExternal(source, channel.url, {
        parse: "json",
        schema: LibCalHoursTodaySchema,
        maxBytes: FEED_MAX_BYTES,
      });
      const date = libCalDate(data, dateKeyInZone(at, timeZone));
      return {
        channel,
        items: normalizeLibraryHours(data, { ...context, date }),
        scope: { kind: "hours", date },
      };
    }
    default: {
      const unknown: never = channel.format;
      throw new Error(`Unknown feed format ${String(unknown)}`);
    }
  }
}

/**
 * Cross-channel dedupe inside one source (WildcatSync events.ics + news.rss): the first channel wins. Two items
 * are the same when they share an externalId (UID/guid), or when they come from different channels and link
 * to the same page. Items of one channel may share a link (LibCal's recurring "Silent Book Club" instances).
 */
export function dedupeAcrossChannels(outcomes: readonly ChannelOutcome[]): void {
  const ids = new Set<string>();
  const linkOwner = new Map<string, string>();
  for (const outcome of outcomes) {
    const kept: NormalizedFeedItem[] = [];
    for (const item of outcome.items) {
      if (ids.has(item.externalId)) continue;
      const link = urlDedupeKey(item.url);
      const owner = linkOwner.get(link);
      if (owner !== undefined && owner !== outcome.channel.channel) continue;
      ids.add(item.externalId);
      if (owner === undefined) linkOwner.set(link, outcome.channel.channel);
      kept.push(item);
    }
    outcome.items = kept;
  }
}

async function syncSource(source: FeedSourceId): Promise<FeedSyncResult> {
  const config = FEED_SOURCES[source];
  const at = now();
  const timeZone = campusTimeZone();
  const settled = await Promise.allSettled(
    config.channels.map((channel) => runChannel(source, channel, at, timeZone)),
  );
  const outcomes: ChannelOutcome[] = [];
  const failures: string[] = [];
  for (const [i, result] of settled.entries()) {
    const channel = config.channels[i]!;
    if (result.status === "fulfilled") {
      outcomes.push(result.value);
      if (result.value.note)
        console.warn(`[feeds] ${source}/${channel.channel}: ${result.value.note}`);
      continue;
    }
    const reason: unknown = result.reason;
    if (reason instanceof MissingFixtureError) throw reason;
    if (!(
      reason instanceof ExternalFetchError ||
      reason instanceof FeedParseError ||
      reason instanceof ChannelFailure
    )) {
      console.error(`[feeds] ${source}/${channel.channel} failed:`, reason);
    }
    failures.push(`${channel.channel}: ${describeFailure(reason)}`);
  }

  dedupeAcrossChannels(outcomes);
  let count = 0;
  for (const outcome of outcomes) {
    const byChannel = new Map<string, NormalizedFeedItem[]>();
    for (const item of outcome.items) {
      const list = byChannel.get(item.channel) ?? [];
      list.push(item);
      byChannel.set(item.channel, list);
    }
    // The configured channel always runs (with [] it stores and prunes nothing).
    if (!byChannel.has(outcome.channel.channel)) byChannel.set(outcome.channel.channel, []);
    for (const [channel, items] of byChannel) {
      const scope = channel === outcome.channel.channel ? outcome.scope : { kind: "none" as const };
      await storeChannelItems(source, channel, items, at, scope);
      count += items.length;
    }
  }

  const ok = failures.length === 0;
  const error = ok ? undefined : failures.join("; ").slice(0, 500);
  await recordSync(source, ok ? { ok, count, at } : { ok, count: 0, error, at });
  return ok ? { source, ok, count } : { source, ok, count, error };
}

const inflight = new Map<FeedSourceId, Promise<FeedSyncResult>>();

/** Sync one source; concurrent calls for the same source share one run. */
function syncSourceOnce(source: FeedSourceId): Promise<FeedSyncResult> {
  let pending = inflight.get(source);
  if (!pending) {
    pending = syncSource(source)
      .catch((error: unknown) => {
        if (error instanceof MissingFixtureError) throw error;
        console.error(`[feeds] ${source} sync failed:`, error);
        const message = describeFailure(error);
        return recordSync(source, { ok: false, count: 0, error: message, at: now() })
          .catch((recordError: unknown) => {
            console.error(`[feeds] could not record the ${source} failure:`, recordError);
          })
          .then(() => ({ source, ok: false, count: 0, error: message }));
      })
      .finally(() => inflight.delete(source));
    inflight.set(source, pending);
  }
  return pending;
}

/** Sources whose last attempt is older than their freshness window (or that never synced). */
export async function staleSources(
  sources: readonly FeedSourceId[],
  at: Date = now(),
): Promise<FeedSourceId[]> {
  await getDb();
  const docs = await SourceSync.find(
    { sourceId: trusted({ $in: [...sources] }) },
    { sourceId: 1, lastAttemptAt: 1 },
  ).lean();
  const attempted = new Map(docs.map((doc) => [doc.sourceId, doc.lastAttemptAt ?? null]));
  return sources.filter((source) => {
    const last = attempted.get(source);
    return !last || at.getTime() - last.getTime() >= FEED_SOURCES[source].freshnessMs;
  });
}

export async function syncFeeds(options: SyncFeedsOptions = {}): Promise<FeedSyncResult[]> {
  const parsed = SyncFeedsOptionsSchema.safeParse(options);
  if (!parsed.success) throw new ApiError(400, "validation_failed", "Unknown feed source.");
  const requested = parsed.data.sources?.length ? parsed.data.sources : [...FEED_SOURCE_IDS];
  const unique = FEED_SOURCE_IDS.filter((id) => requested.includes(id));
  await getDb();
  const targets = parsed.data.onlyStale ? await staleSources(unique) : unique;
  // Let every source finish before surfacing a MissingFixtureError (the only error a source run rethrows).
  const settled = await Promise.allSettled(targets.map((source) => syncSourceOnce(source)));
  const results: FeedSyncResult[] = [];
  for (const outcome of settled) {
    if (outcome.status === "rejected") throw outcome.reason;
    results.push(outcome.value);
  }
  return results;
}
