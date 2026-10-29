import "server-only";
import type { FeedItem, FeedKind, FeedSourceId } from "@/lib/types/feeds";
import { foldForSearch } from "@/server/feeds/text";
import { CAMPUS_TIME_ZONE, dateKeyInZone, MINUTE_MS } from "@/server/feeds/time";

/**
 * Read-time merge of one event listed by several feeds. The library's LibCal and WildcatSync both list "Scary
 * Stories to Tell in the Dark" at the same time in the same room; /events, Today's timeline and the day summary
 * show and count it once. Storage is untouched (each source keeps its own rows, pruning and TTL): only reads merge.
 *
 * Two listings are the same event when they come from different sources, are of the same kind (event or
 * deadline), have the same folded title (case, accents, punctuation and "&"/"and" ignored), start at most
 * MERGE_WINDOW_MS apart, and are in the same place: the same folded location (or one names the other: "Hance
 * Auditorium" ↔ "Hance Auditorium, Chambers Building"), or, when either has no location, the same campus day. A
 * source never merges with itself (two sessions it lists separately stay two). News is never merged.
 *
 * The listing shown is the host office's own calendar (LIBRARY, HURT HUB) over WildcatSync over the Events Digest
 * (SOURCE_PREFERENCE), so the tag names where the event is published first-hand; every field is that listing's,
 * never mixed from the others.
 */

/** Cross-source listings of one event start at most this far apart. */
export const MERGE_WINDOW_MS = 5 * MINUTE_MS;

/** Lower wins: the host office's own calendar, then the shared student calendar, then the digests that restate. */
export const SOURCE_PREFERENCE: Readonly<Record<FeedSourceId, number>> = {
  library: 0,
  "hurt-hub": 0,
  wildcatsync: 1,
  "events-digest": 2,
  "davidson-news": 3,
  davidsonian: 3,
};

const MERGED_KINDS: ReadonlySet<FeedKind> = new Set(["event", "deadline"]);

/** "Scary Stories to Tell in the Dark!" → "scary stories to tell in the dark"; "Q&A" → "q and a". */
export function foldTitle(value: string): string {
  return foldForSearch(value)
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function samePlace(a: FeedItem, b: FeedItem, timeZone: string): boolean {
  const left = a.location ? foldTitle(a.location) : "";
  const right = b.location ? foldTitle(b.location) : "";
  if (left && right) {
    return (
      left === right || ` ${left} `.includes(` ${right} `) || ` ${right} `.includes(` ${left} `)
    );
  }
  return (
    dateKeyInZone(new Date(a.startsAt!), timeZone) ===
    dateKeyInZone(new Date(b.startsAt!), timeZone)
  );
}

export interface ListingGroup {
  /** The listing that opened the group (the earliest in input order); later listings must start near it. */
  first: FeedItem;
  /** The listing to show (SOURCE_PREFERENCE, then input order). */
  shown: FeedItem;
  /** Every source listing the event, in input order. */
  sources: FeedSourceId[];
}

/**
 * Groups the listings of one event (see the module comment), in the input order of each group's first listing.
 * Callers pass items sorted by start (listEventsPage's order); an item without a start, or of another kind, is a
 * group of its own.
 */
export function groupListings(
  items: readonly FeedItem[],
  timeZone: string = CAMPUS_TIME_ZONE,
): ListingGroup[] {
  const groups: ListingGroup[] = [];
  const open = new Map<string, ListingGroup[]>();
  for (const item of items) {
    if (!item.startsAt || !MERGED_KINDS.has(item.kind)) {
      groups.push({ first: item, shown: item, sources: [item.source] });
      continue;
    }
    const key = `${item.kind}\n${foldTitle(item.title)}`;
    const start = Date.parse(item.startsAt);
    const candidates = open.get(key) ?? [];
    const group = candidates.find(
      (candidate) =>
        !candidate.sources.includes(item.source) &&
        Math.abs(Date.parse(candidate.first.startsAt!) - start) <= MERGE_WINDOW_MS &&
        samePlace(candidate.first, item, timeZone),
    );
    if (group) {
      group.sources.push(item.source);
      if (SOURCE_PREFERENCE[item.source] < SOURCE_PREFERENCE[group.shown.source]) {
        group.shown = item;
      }
      continue;
    }
    const created: ListingGroup = { first: item, shown: item, sources: [item.source] };
    groups.push(created);
    open.set(key, [...candidates, created]);
  }
  return groups;
}

/** One item per event (groupListings' shown listings), in the order of each event's first listing. */
export function mergeListings(
  items: readonly FeedItem[],
  timeZone: string = CAMPUS_TIME_ZONE,
): FeedItem[] {
  return groupListings(items, timeZone).map((group) => group.shown);
}
