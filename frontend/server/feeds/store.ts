import "server-only";
import { createHash } from "node:crypto";
import type { AnyBulkWriteOperation, QueryFilter } from "mongoose";
import {
  FeedItemSchema,
  type FeedItem as FeedItemWire,
  type FeedKind,
  type FeedSourceId,
} from "@/lib/types/feeds";
import FeedItem, { type FeedItemDoc } from "@/models/FeedItem";
import { trusted } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";
import { foldForSearch } from "@/server/feeds/text";
import { DAY_MS } from "@/server/feeds/time";
import type { NormalizedFeedItem } from "@/server/feeds/types";

/**
 * `feeditems` persistence for server/feeds (PLAN §4 "New data goes only to new collections").
 *
 * - Upsert by (source, externalId); unchanged items (same content hash) only get their fetchedAt bumped.
 * - TTL: expiresAt = 60 days after the item ends (endsAt, else startsAt, else fetchedAt). An item already past
 *   that point (a story published more than 60 days ago that its feed still carries) is not stored or counted:
 *   the TTL monitor would delete it within a minute and the next sync would write it again.
 * - Pruning happens only for a channel that just synced successfully with a non-empty result, and only for items
 *   that are still ahead (upcoming events/deadlines, or the same day's hours) and vanished upstream (cancelled
 *   or removed). If the new result has fewer than half of the upcoming items we hold, nothing is pruned (a
 *   truncated or half-empty upstream answer never wipes good data). Past items and news are never pruned: they
 *   age out through the TTL. A failing channel is not written at all, so its last good items stay.
 */

export const FEED_ITEM_TTL_DAYS = 60;
/** Prune only when the new upcoming set is at least this share of what is stored. */
export const PRUNE_MIN_RATIO = 0.5;

/** Stable public id: a hash of source + upstream id (never the Mongo _id). */
export function feedItemId(source: FeedSourceId, externalId: string): string {
  return createHash("sha256").update(`${source}\n${externalId}`, "utf8").digest("hex").slice(0, 32);
}

export function expiryOf(item: Pick<NormalizedFeedItem, "startsAt" | "endsAt">, fetchedAt: Date) {
  const anchor = item.endsAt ?? item.startsAt ?? fetchedAt;
  return new Date(anchor.getTime() + FEED_ITEM_TTL_DAYS * DAY_MS);
}

function contentHashOf(item: NormalizedFeedItem): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        item.channel,
        item.kind,
        item.title,
        item.url,
        item.startsAt?.toISOString() ?? null,
        item.endsAt?.toISOString() ?? null,
        item.allDay,
        item.location,
        item.summaryText,
        item.hours ?? null,
      ]),
      "utf8",
    )
    .digest("hex");
}

export function searchTextOf(item: Pick<NormalizedFeedItem, "title" | "location" | "summaryText">) {
  return foldForSearch(
    [item.title, item.location, item.summaryText].filter(Boolean).join(" "),
  ).slice(0, 1200);
}

export type PruneScope =
  { kind: "upcoming"; now: Date } | { kind: "hours"; date: string } | { kind: "none" };

export interface StoreResult {
  /** Items now held for this batch (written + unchanged; expired ones are left out). */
  stored: number;
  written: number;
  unchanged: number;
  pruned: number;
}

async function withDuplicateRetry<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    // Two concurrent syncs (two instances) can race on the same new upsert; the loser retries as an update.
    if (!isDuplicateKeyError(error)) throw error;
    return write();
  }
}

/**
 * Store one channel's freshly parsed items (already deduplicated) and prune what vanished within `scope`.
 */
export async function storeChannelItems(
  source: FeedSourceId,
  channel: string,
  items: readonly NormalizedFeedItem[],
  fetchedAt: Date,
  scope: PruneScope,
): Promise<StoreResult> {
  const live = items.filter((item) => expiryOf(item, fetchedAt).getTime() > fetchedAt.getTime());
  const ids = live.map((item) => item.externalId);
  const existing = ids.length
    ? await FeedItem.find(
        { source, externalId: trusted({ $in: ids }) },
        { externalId: 1, contentHash: 1, channel: 1 },
      ).lean()
    : [];
  const hashes = new Map(existing.map((doc) => [doc.externalId, doc.contentHash]));

  const unchanged: string[] = [];
  const operations: AnyBulkWriteOperation<FeedItemDoc>[] = [];
  for (const item of live) {
    const hash = contentHashOf(item);
    if (hashes.get(item.externalId) === hash) {
      unchanged.push(item.externalId);
      continue;
    }
    operations.push({
      updateOne: {
        filter: { source, externalId: item.externalId },
        update: {
          $set: {
            channel: item.channel,
            kind: item.kind,
            title: item.title,
            url: item.url,
            startsAt: item.startsAt,
            endsAt: item.endsAt,
            allDay: item.allDay,
            location: item.location,
            summaryText: item.summaryText,
            searchText: searchTextOf(item),
            hours: item.hours ?? null,
            contentHash: hash,
            fetchedAt,
            expiresAt: expiryOf(item, fetchedAt),
          },
        },
        upsert: true,
      },
    });
  }
  if (operations.length) {
    await withDuplicateRetry(() => FeedItem.bulkWrite(operations, { ordered: false }));
  }
  if (unchanged.length) {
    await FeedItem.updateMany(
      { source, externalId: trusted({ $in: unchanged }) },
      { $set: { fetchedAt } },
    );
  }

  let pruned = 0;
  if (live.length > 0 && scope.kind !== "none") {
    const timedKinds: FeedKind[] = ["event", "deadline"];
    const base: QueryFilter<FeedItemDoc> =
      scope.kind === "upcoming"
        ? {
            source,
            channel,
            kind: trusted({ $in: timedKinds }),
            startsAt: trusted({ $gte: scope.now }),
          }
        : { source, channel, kind: "hours", "hours.date": scope.date };
    const upcomingNew = live.filter(
      (item) =>
        item.channel === channel &&
        (scope.kind === "upcoming"
          ? (item.kind === "event" || item.kind === "deadline") &&
            !!item.startsAt &&
            item.startsAt.getTime() >= scope.now.getTime()
          : item.kind === "hours" && item.hours?.date === scope.date),
    ).length;
    const upcomingStored = await FeedItem.countDocuments(base);
    if (upcomingNew >= upcomingStored * PRUNE_MIN_RATIO) {
      const result = await FeedItem.deleteMany({
        ...base,
        externalId: trusted({ $nin: ids }),
      });
      pruned = result.deletedCount;
    }
  }
  return { stored: live.length, written: operations.length, unchanged: unchanged.length, pruned };
}

type StoredItem = Pick<
  FeedItemDoc,
  | "source"
  | "externalId"
  | "kind"
  | "title"
  | "url"
  | "startsAt"
  | "endsAt"
  | "allDay"
  | "location"
  | "summaryText"
  | "fetchedAt"
>;

/** A stored document as the wire FeedItem; null (and logged) if the stored row no longer fits the contract. */
export function toFeedItem(doc: StoredItem): FeedItemWire | null {
  const candidate = {
    id: feedItemId(doc.source, doc.externalId),
    source: doc.source,
    kind: doc.kind,
    title: doc.title,
    url: doc.url,
    startsAt: doc.startsAt ? doc.startsAt.toISOString() : null,
    endsAt: doc.endsAt ? doc.endsAt.toISOString() : null,
    allDay: doc.allDay ?? false,
    location: doc.location ?? null,
    summaryText: doc.summaryText ?? null,
    fetchedAt: doc.fetchedAt.toISOString(),
  };
  const parsed = FeedItemSchema.safeParse(candidate);
  if (!parsed.success) {
    console.error(
      `[feeds] skipping stored ${doc.source} item ${doc.externalId}:`,
      parsed.error.message,
    );
    return null;
  }
  return parsed.data;
}

/** Fields the read paths load (everything toFeedItem needs). */
export const WIRE_PROJECTION = {
  source: 1,
  externalId: 1,
  kind: 1,
  title: 1,
  url: 1,
  startsAt: 1,
  endsAt: 1,
  allDay: 1,
  location: 1,
  summaryText: 1,
  fetchedAt: 1,
} as const;
