import "server-only";
import ICAL from "ical.js";
import { icalTimeToInstant } from "@/server/feeds/ics";
import { cleanLine } from "@/server/feeds/text";
import { zonedTimeToUtc } from "@/server/feeds/time";

/**
 * A Moodle calendar export (calendar/export_execute.php) → the events MakeItSo keeps: UID, title, due time and the
 * course's short name (CATEGORIES). Nothing else is read: DESCRIPTION (instructors' text, links), LOCATION, URL
 * and the rest are dropped here and never stored.
 *
 * Strict on what it accepts: an iCalendar document whose PRODID names Moodle. Moodle answers a wrong or revoked
 * token with HTTP 200 and the text "Invalid authentication" (or "Invalid user"), which is an `auth` failure, not
 * an empty calendar. Per event:
 *   - UID and SUMMARY are required (an event without either is skipped and counted);
 *   - the due time is DTSTART (Moodle exports a due date as DTSTART = DTEND); a date without a time is due at
 *     23:59 Davidson time that day;
 *   - "… opens" events (a quiz or an assignment opening) are not deadlines and are left out; "Problem set 3 is
 *     due" becomes "Problem set 3"; STATUS:CANCELLED events are left out;
 *   - at most MOODLE_MAX_EVENTS events are kept: the soonest upcoming first, then the most recent past ones; the
 *     rest are counted in `capped`.
 */

export const MOODLE_MAX_EVENTS = 500;
export const MOODLE_TITLE_MAX = 120;
const UID_MAX = 255;
const CATEGORY_MAX = 100;
const CAMPUS_TIME_ZONE = "America/New_York";

export type MoodleFeedProblem = "auth" | "not_calendar" | "not_moodle" | "malformed";

export class MoodleFeedError extends Error {
  constructor(readonly problem: MoodleFeedProblem) {
    super(`Not a usable Moodle calendar (${problem})`);
    this.name = "MoodleFeedError";
  }
}

export interface MoodleEvent {
  /** Moodle's UID for the event ("1234@moodle.davidson.edu"): what a later sync matches on. */
  uid: string;
  title: string;
  /** ISO instant. */
  dueAt: string;
  /** The course's short name as Moodle labels the event, or null. */
  category: string | null;
}

export interface MoodleParseResult {
  events: MoodleEvent[];
  /** Events that could not be read (no UID, no title, no usable start). */
  skipped: number;
  /** Events left out because the feed had more than MOODLE_MAX_EVENTS. */
  capped: number;
}

function stringValue(component: ICAL.Component, name: string): string | null {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" ? value : null;
}

/** Moodle's "<name> is due" → "<name>"; other wording is kept as published. */
function titleOf(summary: string): string {
  const line = cleanLine(summary, 400).replace(/\s+is due$/i, "");
  return cleanLine(line, MOODLE_TITLE_MAX);
}

function dueOf(component: ICAL.Component): Date | null {
  const property = component.getFirstProperty("dtstart");
  const value = property?.getFirstValue();
  if (!(value instanceof ICAL.Time)) return null;
  if (value.isDate) {
    return zonedTimeToUtc(
      { year: value.year, month: value.month, day: value.day, hour: 23, minute: 59 },
      CAMPUS_TIME_ZONE,
    );
  }
  const tzid = property?.getParameter("tzid");
  const instant = icalTimeToInstant(
    value,
    typeof tzid === "string" ? tzid : null,
    CAMPUS_TIME_ZONE,
  );
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function categoryOf(component: ICAL.Component): string | null {
  const values = component.getFirstProperty("categories")?.getValues() ?? [];
  const first = values.find(
    (value): value is string => typeof value === "string" && !!value.trim(),
  );
  return first ? cleanLine(first, CATEGORY_MAX) || null : null;
}

export function parseMoodleCalendar(text: string, now: Date): MoodleParseResult {
  const body = text.replace(/^﻿/, "");
  if (!/^\s*BEGIN:VCALENDAR\r?\n/i.test(body)) {
    const auth = /^\s*invalid (?:authentication|user)\b/i.test(body);
    throw new MoodleFeedError(auth ? "auth" : "not_calendar");
  }
  let root: ICAL.Component;
  try {
    const parsed = ICAL.parse(body) as unknown[];
    // One VCALENDAR is a jCal array ["vcalendar", ...]; several come back as an array of them.
    root = new ICAL.Component((typeof parsed[0] === "string" ? parsed : parsed[0]) as unknown[]);
  } catch {
    throw new MoodleFeedError("malformed");
  }
  if (root.name !== "vcalendar") throw new MoodleFeedError("malformed");
  if (!/moodle/i.test(stringValue(root, "prodid") ?? "")) throw new MoodleFeedError("not_moodle");

  let skipped = 0;
  const events: MoodleEvent[] = [];
  const seen = new Set<string>();
  for (const vevent of root.getAllSubcomponents("vevent")) {
    if (String(vevent.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED")
      continue;
    const uid = (stringValue(vevent, "uid") ?? "").trim();
    const summary = stringValue(vevent, "summary") ?? "";
    let due: Date | null = null;
    try {
      due = dueOf(vevent);
    } catch {
      due = null;
    }
    const title = titleOf(summary);
    if (!uid || uid.length > UID_MAX || !title || !due) {
      skipped++;
      continue;
    }
    if (/\bopens$/i.test(title)) continue;
    if (seen.has(uid)) continue;
    seen.add(uid);
    events.push({ uid, title, dueAt: due.toISOString(), category: categoryOf(vevent) });
  }

  // Upcoming soonest first, then the most recent past ones: what a cap keeps.
  const t = now.getTime();
  const rank = (event: MoodleEvent) => {
    const at = Date.parse(event.dueAt);
    return at >= t ? at - t : Number.MAX_SAFE_INTEGER / 2 + (t - at);
  };
  events.sort((a, b) => rank(a) - rank(b) || a.uid.localeCompare(b.uid));
  const kept = events.slice(0, MOODLE_MAX_EVENTS);
  return { events: kept, skipped, capped: events.length - kept.length };
}
