import "server-only";
import type { FeedItem } from "@/lib/types/feeds";
import { feedInterval } from "@/server/today/agenda";
import { dayBounds, etDay } from "@/server/today/time";

/**
 * This week on campus (PLAN §3): the dated happenings of the next days from the synced feeds. A long-running item
 * that is already under way (an application season since July, an eight-week course) would fill the slots with
 * "Today, Under way" every day of the week, so items that started before today and last more than a day are left
 * out; everything else is kept in start order. Pure.
 */

/** Items lasting longer than this that began before today are background, not this week's happenings. */
export const LONG_RUNNING_MS = 24 * 60 * 60 * 1000;

export function pickCampusEvents(items: readonly FeedItem[], now: Date, max: number): FeedItem[] {
  const startOfToday = dayBounds(etDay(now)).start.getTime();
  return items
    .filter((item) => {
      const span = feedInterval(item);
      if (!span) return true;
      return !(span.start < startOfToday && span.end - span.start > LONG_RUNNING_MS);
    })
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? "") || a.id.localeCompare(b.id),
    )
    .slice(0, max);
}
