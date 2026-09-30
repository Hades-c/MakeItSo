import { readFileSync } from "node:fs";
import path from "node:path";
import type { FeedSourceId } from "@/lib/types/feeds";

/** Shared helpers for the W4a feed tests. */

export const TZ = "America/New_York";
/** FIXTURES_NOW (vitest.config.mts): the day the feed fixtures were recorded. */
export const FIXTURE_NOW = new Date("2026-09-30T12:00:00-04:00");

export function fixture(relative: string): string {
  return readFileSync(path.join(process.cwd(), "tests", "fixtures", "external", relative), "utf8");
}

/** A VCALENDAR with the given VEVENT bodies (lines joined with CRLF, like real feeds). */
export function ics(...events: string[][]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MakeItSo tests//EN"];
  for (const event of events) lines.push("BEGIN:VEVENT", ...event, "END:VEVENT");
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function context(source: FeedSourceId, channel = "events", now: Date = FIXTURE_NOW) {
  return { source, channel, now, timeZone: TZ };
}

export function rss(items: string[], channelExtra = ""): string {
  return `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>T</title>${channelExtra}${items
    .map((item) => `<item>${item}</item>`)
    .join("")}</channel></rss>`;
}
