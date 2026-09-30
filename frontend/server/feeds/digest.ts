import "server-only";
import { decode } from "html-entities";
import { dropStaleItems, type RssChannel } from "@/server/feeds/rss";
import { cleanLine, htmlToText, oneLine, TITLE_MAX } from "@/server/feeds/text";
import { addDaysToKey, dateKeyInZone, startOfDayInZone, zonedTimeToUtc } from "@/server/feeds/time";
import type { NormalizedFeedItem, ParseContext } from "@/server/feeds/types";
import { pickItemUrl, safeItemUrl, urlDedupeKey } from "@/server/feeds/urls";

/**
 * The Davidson Events Digest (a weekly Mailchimp newsletter, RSS from the campaign archive). Each issue is one
 * HTML newsletter whose event list is a run of
 *   <h3><a href="https://www.davidson.edu/events/booking/…"><span>Title</span></a></h3>
 *   <strong><em>Sep 26, 2026 10:00 am</em></strong>
 * Every listed event becomes an "event" item (source events-digest, link to Davidson's own event page, start in
 * America/New_York, no end time given). Issues older than 60 days before the newest are skipped (stale), the same
 * event listed in several issues is kept once (newest issue wins), and events that ended before today are
 * dropped. An issue whose layout yields no events is kept as a "news" item on channel "issues" so the digest never
 * silently disappears when Mailchimp's markup changes.
 */

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DATE_PATTERN =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s*(?:at|,|@)?\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?)?/i;

export interface DigestDate {
  startsAt: Date;
  allDay: boolean;
}

/** "Sep 26, 2026 10:00 am" / "October 5, 2026" / "Oct 5, 2026 at 5 p.m." in `timeZone`, or null. */
export function parseDigestDate(text: string, timeZone: string): DigestDate | null {
  const match = DATE_PATTERN.exec(text);
  if (!match) return null;
  const month = MONTHS[match[1]!.slice(0, 3).toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;
  if (!match[4]) {
    const key = `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { startsAt: startOfDayInZone(key, timeZone), allDay: true };
  }
  let hour = Number(match[4]);
  const minute = Number(match[5] ?? "0");
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = match[6]!.toLowerCase() === "p";
  if (hour === 12) hour = pm ? 12 : 0;
  else if (pm) hour += 12;
  return { startsAt: zonedTimeToUtc({ year, month, day, hour, minute }, timeZone), allDay: false };
}

export interface DigestEntry {
  title: string;
  href: string | null;
  date: DigestDate | null;
}

/** The event list of one issue's HTML. */
export function extractDigestEntries(html: string, timeZone: string): DigestEntry[] {
  const entries: DigestEntry[] = [];
  const blocks = html.split(/<h3\b[^>]*>/i).slice(1);
  for (const block of blocks) {
    const end = block.search(/<\/h3\s*>/i);
    if (end < 0) continue;
    const heading = block.slice(0, end);
    const after = block.slice(end);
    const title = oneLine(htmlToText(heading));
    if (!title) continue;
    const href = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(heading);
    const rawHref = href ? decode(href[1] ?? href[2] ?? "") : null;
    entries.push({ title, href: rawHref, date: parseDigestDate(htmlToText(after), timeZone) });
  }
  return entries;
}

export function normalizeDigest(
  channel: RssChannel,
  context: ParseContext,
): { items: NormalizedFeedItem[]; stale: number; skipped: number } {
  const { source, now, timeZone } = context;
  const windowStart = startOfDayInZone(dateKeyInZone(now, timeZone), timeZone);
  const { kept: issues, stale } = dropStaleItems(channel.items);
  const items: NormalizedFeedItem[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const issue of issues) {
    const issueUrl = pickItemUrl(source, [issue.link, issue.guid], channel.link ?? undefined);
    const html = issue.description ?? issue.content ?? "";
    const entries = extractDigestEntries(html, timeZone);
    if (entries.length === 0) {
      const title = cleanLine(issue.title, TITLE_MAX);
      if (title && issueUrl) {
        items.push({
          source,
          channel: "issues",
          externalId: (issue.guid ?? issueUrl).slice(0, 400),
          kind: "news",
          title,
          url: issueUrl,
          startsAt: issue.pubDate,
          endsAt: null,
          allDay: false,
          location: null,
          summaryText: null,
        });
      } else {
        skipped++;
      }
      continue;
    }
    for (const entry of entries) {
      const title = cleanLine(entry.title, TITLE_MAX);
      const url = safeItemUrl(source, entry.href) ?? issueUrl;
      if (!title || !url || !entry.date) {
        skipped++;
        continue;
      }
      const { startsAt, allDay } = entry.date;
      const endsAt = allDay
        ? startOfDayInZone(addDaysToKey(dateKeyInZone(startsAt, timeZone), 1), timeZone)
        : null;
      // Past events (older issues list them too) are not worth storing.
      if ((endsAt ?? startsAt).getTime() < windowStart.getTime()) continue;
      const externalId = `${urlDedupeKey(url)}|${startsAt.toISOString()}`.slice(0, 400);
      if (seen.has(externalId)) continue;
      seen.add(externalId);
      items.push({
        source,
        channel: "events",
        externalId,
        kind: "event",
        title,
        url,
        startsAt,
        endsAt,
        allDay,
        location: null,
        summaryText: null,
      });
    }
  }
  items.sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));
  return { items, stale, skipped };
}
