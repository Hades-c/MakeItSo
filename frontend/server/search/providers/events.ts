import "server-only";
import type { SearchResult } from "@/lib/api/search";
import { formatShortDate, formatTime, formatWeekday } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { FeedItem } from "@/lib/types/feeds";
import { readEnv } from "@/server/env";
import { listEvents } from "@/server/feeds";
import { foldForSearch } from "@/server/feeds/text";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: events (owner W4a). Upcoming feed items (events and deadlines in the next 30 days) whose
 * title, location or summary contains every word of `q`; titles that match rank first, then by start time.
 * href: the events page filtered to the item's title; source: the item's own feed source. Nothing when
 * FEATURE_EVENTS is off.
 */

export const EVENTS_SEARCH_WINDOW_DAYS = 30;
const CANDIDATES_PER_RESULT = 3;

function subtitleOf(item: FeedItem, timeZone: string): string {
  const parts: string[] = [];
  if (item.startsAt) {
    const start = new Date(item.startsAt);
    const day = `${formatWeekday(start, timeZone).slice(0, 3)}, ${formatShortDate(start, timeZone)}`;
    if (item.kind === "deadline") parts.push(`Due ${day}, ${formatTime(start, timeZone)}`);
    else if (item.allDay) parts.push(`${day} · All day`);
    else parts.push(`${day} · ${formatTime(start, timeZone)}`);
  }
  if (item.location) parts.push(item.location);
  return parts.join(" · ");
}

/** 0: every word starts a title word; 1: every word is in the title; 2: matched elsewhere. */
function titleRank(title: string, words: readonly string[]): number {
  const folded = foldForSearch(title);
  if (words.every((word) => folded.startsWith(word) || folded.includes(` ${word}`))) return 0;
  if (words.every((word) => folded.includes(word))) return 1;
  return 2;
}

export async function search(
  q: string,
  limit: number,
  ctx: SearchContext,
): Promise<SearchResult[]> {
  if (!ctx.flags.events || limit < 1) return [];
  const from = ctx.now;
  const to = new Date(from.getTime() + EVENTS_SEARCH_WINDOW_DAYS * 24 * 60 * 60_000);
  const items = await listEvents(
    {
      from: from.toISOString(),
      to: to.toISOString(),
      q,
      limit: Math.min(500, limit * CANDIDATES_PER_RESULT),
    },
    { refresh: false },
  );
  const words = foldForSearch(q).split(" ").filter(Boolean);
  const timeZone = readEnv("APP_TIMEZONE");
  return items
    .map((item, index) => ({ item, index, rank: titleRank(item.title, words) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map(({ item }) => {
      const subtitle = subtitleOf(item, timeZone);
      return {
        kind: "event" as const,
        id: item.id,
        title: item.title,
        ...(subtitle ? { subtitle } : {}),
        href: routes.events({ q: item.title.slice(0, 100) }),
        source: item.source,
      };
    });
}
