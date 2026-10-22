import "server-only";
import * as z from "zod";
import { cleanLine, LOCATION_MAX, summaryFromHtml, TITLE_MAX } from "@/server/feeds/text";
import {
  addDaysToKey,
  dateKeyInZone,
  MINUTE_MS,
  resolveTimeZone,
  startOfDayInZone,
  zonedTimeToUtc,
} from "@/server/feeds/time";
import type { NormalizedFeedItem, ParseContext } from "@/server/feeds/types";
import { pickItemUrl } from "@/server/feeds/urls";

/**
 * Hurt Hub fallback: The Events Calendar's REST API (`/wp-json/tribe/events/v1/events`), used when the iCal
 * export fails. Events get the same externalId as their iCal twin ("hurt-hub:<post id>", see hurtHubExternalId),
 * so switching between the two never duplicates anything.
 */

const LocalDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/);

export const TribeEventSchema = z.looseObject({
  id: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  url: z.string(),
  title: z.string(),
  description: z.string().optional().nullable(),
  excerpt: z.string().optional().nullable(),
  all_day: z.boolean().optional(),
  start_date: LocalDateTime,
  end_date: LocalDateTime.optional().nullable(),
  utc_start_date: LocalDateTime.optional().nullable(),
  utc_end_date: LocalDateTime.optional().nullable(),
  timezone: z.string().optional().nullable(),
  status: z.string().optional(),
  venue: z
    .union([
      z.looseObject({
        venue: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
      }),
      z.array(z.unknown()),
    ])
    .optional()
    .nullable(),
});
export type TribeEvent = z.infer<typeof TribeEventSchema>;

/** The page envelope; events are validated one by one so a single odd event is skipped, not fatal. */
export const TribePageSchema = z.looseObject({
  events: z.array(z.unknown()),
  total_pages: z.number().int().optional(),
  next_rest_url: z.string().optional().nullable(),
});
export type TribePage = z.infer<typeof TribePageSchema>;

/**
 * The stored id of a Hurt Hub event: The Events Calendar's iCal UIDs are "<post id>-<start>-<end>@host" and the
 * REST API's `id` is the post id, so both map to "hurt-hub:<post id>". Other UIDs stay as they are.
 */
export function hurtHubExternalId(uid: string): string {
  const match = /^(\d+)-\d+-\d+@hurthub\.davidson\.edu$/i.exec(uid.trim());
  return match ? `hurt-hub:${match[1]}` : uid;
}

function wallOf(value: string) {
  const [date = "", time = "00:00:00"] = value.split(" ");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  return {
    year: year ?? 0,
    month: month ?? 1,
    day: day ?? 1,
    hour: hour ?? 0,
    minute: minute ?? 0,
    second: second ?? 0,
  };
}

function utcOf(value: string): Date {
  const w = wallOf(value);
  return new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second));
}

export function normalizeTribeEvents(
  events: readonly unknown[],
  options: ParseContext & { fallbackUrl: string },
): { items: NormalizedFeedItem[]; skipped: number } {
  const { source, channel, now, timeZone } = options;
  const windowStart = startOfDayInZone(dateKeyInZone(now, timeZone), timeZone);
  const items: NormalizedFeedItem[] = [];
  let skipped = 0;
  for (const raw of events) {
    const parsed = TribeEventSchema.safeParse(raw);
    if (!parsed.success) {
      skipped++;
      continue;
    }
    const event = parsed.data;
    if (event.status && event.status !== "publish") continue;
    const title = cleanLine(event.title, TITLE_MAX);
    const url = pickItemUrl(source, [event.url]) ?? pickItemUrl(source, [options.fallbackUrl]);
    if (!title || !url) {
      skipped++;
      continue;
    }
    const zone = resolveTimeZone(event.timezone) ?? timeZone;
    let startsAt: Date;
    let endsAt: Date;
    const allDay = event.all_day === true;
    if (allDay) {
      const firstDay = event.start_date.slice(0, 10);
      const lastDay = (event.end_date ?? event.start_date).slice(0, 10);
      startsAt = startOfDayInZone(firstDay, timeZone);
      endsAt = startOfDayInZone(addDaysToKey(lastDay < firstDay ? firstDay : lastDay, 1), timeZone);
    } else {
      startsAt = event.utc_start_date
        ? utcOf(event.utc_start_date)
        : zonedTimeToUtc(wallOf(event.start_date), zone);
      endsAt = event.utc_end_date
        ? utcOf(event.utc_end_date)
        : event.end_date
          ? zonedTimeToUtc(wallOf(event.end_date), zone)
          : startsAt;
      if (endsAt.getTime() < startsAt.getTime()) endsAt = startsAt;
    }
    if (endsAt.getTime() <= windowStart.getTime() && startsAt.getTime() < windowStart.getTime()) {
      continue;
    }
    const venue = event.venue && !Array.isArray(event.venue) ? event.venue : null;
    const location = venue
      ? cleanLine([venue.venue, venue.address].filter(Boolean).join(", "), LOCATION_MAX) || null
      : null;
    items.push({
      source,
      channel,
      externalId: `hurt-hub:${String(event.id)}`,
      kind: !allDay && endsAt.getTime() - startsAt.getTime() <= MINUTE_MS ? "deadline" : "event",
      title,
      url,
      startsAt,
      endsAt,
      allDay,
      location,
      summaryText: summaryFromHtml(event.description || event.excerpt),
    });
  }
  items.sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));
  return { items, skipped };
}
