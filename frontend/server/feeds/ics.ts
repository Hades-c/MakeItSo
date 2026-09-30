import "server-only";
import ICAL from "ical.js";
import {
  cleanLine,
  LOCATION_MAX,
  normalizeText,
  summaryFromHtml,
  TITLE_MAX,
  htmlToText,
} from "@/server/feeds/text";
import {
  addDaysToKey,
  dateKeyInZone,
  DAY_MS,
  MINUTE_MS,
  resolveTimeZone,
  startOfDayInZone,
  zonedTimeToUtc,
} from "@/server/feeds/time";
import { FeedParseError, type NormalizedFeedItem, type ParseContext } from "@/server/feeds/types";
import { pickItemUrl } from "@/server/feeds/urls";

/**
 * iCalendar (RFC 5545) → NormalizedFeedItem, with ical.js (PLAN §5 "Dates/times"):
 *   - `Z` times are absolute; TZID times (with or without a VTIMEZONE block) and floating times are wall-clock
 *     times in that zone (floating = America/New_York) and become instants via Intl, so DST is handled.
 *   - `VALUE=DATE` = all-day: startsAt = midnight America/New_York of the first day, endsAt = midnight after the
 *     last day (DTEND is exclusive; a missing DTEND means one day).
 *   - An event lasting ≤ 1 minute (including zero-length) is a deadline, due at startsAt.
 *   - RRULE/RDATE/EXDATE/RECURRENCE-ID are expanded for the next `horizonDays` (30) days; each instance gets its
 *     own externalId "<uid>#<original start ISO>" so a moved instance keeps its identity.
 *   - STATUS:CANCELLED (event or instance) and CLASS:PRIVATE/CONFIDENTIAL events are skipped; so is anything that
 *     ended before today (America/New_York) and any event whose fields cannot be read (counted in `skipped`).
 */

export interface IcsOptions extends ParseContext {
  /** Link for events without a usable URL (must pass the source's allow-list). */
  fallbackUrl: string;
  /** RRULE expansion horizon in days (default 30). */
  horizonDays?: number;
  /** Map an upstream UID to the stored externalId (e.g. Hurt Hub post ids shared with the Tribe fallback). */
  externalIdFor?: (uid: string) => string;
  /** Source-specific cleanup of the description text before it becomes the summary. */
  cleanDescription?: (text: string) => string;
}

export interface IcsParseResult {
  items: NormalizedFeedItem[];
  /** Events that could not be read (bad dates, missing title). */
  skipped: number;
}

export const DEFAULT_RRULE_HORIZON_DAYS = 30;
/** Deadline threshold: events this short (or shorter) are deadlines. */
export const DEADLINE_MAX_MS = MINUTE_MS;
const MAX_OCCURRENCE_STEPS = 50_000;
const MAX_EVENTS = 5_000;
const MAX_EXTERNAL_ID = 400;

type IcalTime = ICAL.Time;
type IcalComponent = ICAL.Component;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKeyOf(time: IcalTime): string {
  return `${String(time.year).padStart(4, "0")}-${pad(time.month)}-${pad(time.day)}`;
}

function tzidParam(component: IcalComponent, property: "dtstart" | "dtend"): string | null {
  const value = component.getFirstProperty(property)?.getParameter("tzid");
  return typeof value === "string" && value ? value : null;
}

/**
 * The instant of a DATE-TIME value. `tzid` is the TZID parameter of the property the value came from (ical.js
 * drops it on recurrence instances when there is no VTIMEZONE, so callers pass the master's).
 */
export function icalTimeToInstant(
  time: IcalTime,
  tzid: string | null,
  campusTimeZone: string,
): Date {
  if (time.isDate) return startOfDayInZone(dateKeyOf(time), campusTimeZone);
  const wall = {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
  };
  const zone = time.zone;
  const zoneId = zone && zone.tzid && zone.tzid !== "floating" ? zone.tzid : null;
  if (zoneId === "UTC") {
    return new Date(
      Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second),
    );
  }
  const iana = resolveTimeZone(zoneId ?? tzid);
  if (iana === "UTC") {
    return new Date(
      Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second),
    );
  }
  if (iana) return zonedTimeToUtc(wall, iana);
  // A VTIMEZONE with a name Intl does not know: trust its own rules.
  if (zoneId && zone.component) return new Date(time.toUnixTime() * 1000);
  return zonedTimeToUtc(wall, campusTimeZone);
}

interface Span {
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
}

function spanOf(
  start: IcalTime,
  end: IcalTime | null,
  startTzid: string | null,
  endTzid: string | null,
  campusTimeZone: string,
): Span {
  if (start.isDate) {
    const firstDay = dateKeyOf(start);
    const startsAt = startOfDayInZone(firstDay, campusTimeZone);
    const endKey = end ? dateKeyOf(end) : addDaysToKey(firstDay, 1);
    let endsAt = startOfDayInZone(endKey, campusTimeZone);
    if (endsAt.getTime() <= startsAt.getTime()) {
      endsAt = startOfDayInZone(addDaysToKey(firstDay, 1), campusTimeZone);
    }
    return { startsAt, endsAt, allDay: true };
  }
  const startsAt = icalTimeToInstant(start, startTzid, campusTimeZone);
  let endsAt = end ? icalTimeToInstant(end, endTzid ?? startTzid, campusTimeZone) : startsAt;
  if (endsAt.getTime() < startsAt.getTime()) endsAt = startsAt;
  return { startsAt, endsAt, allDay: false };
}

function isSkippedStatus(component: IcalComponent): boolean {
  const status = String(component.getFirstPropertyValue("status") ?? "").toUpperCase();
  const klass = String(component.getFirstPropertyValue("class") ?? "").toUpperCase();
  return status === "CANCELLED" || klass === "PRIVATE" || klass === "CONFIDENTIAL";
}

function stringProp(component: IcalComponent, name: string): string | null {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" ? value : null;
}

function capExternalId(id: string): string {
  return id.length <= MAX_EXTERNAL_ID ? id : id.slice(0, MAX_EXTERNAL_ID);
}

/** Split the document into VCALENDAR roots (ical.js returns one root or an array of roots). */
function parseRoots(text: string): IcalComponent[] {
  const body = text.replace(/^\uFEFF/, "");
  if (!/^\s*BEGIN:VCALENDAR/i.test(body)) {
    throw new FeedParseError("Not an iCalendar document (no BEGIN:VCALENDAR)");
  }
  let parsed: unknown;
  try {
    parsed = ICAL.parse(body);
  } catch (error) {
    throw new FeedParseError(
      `Invalid iCalendar data: ${error instanceof Error ? error.message : "parse error"}`,
      { cause: error },
    );
  }
  const roots = (
    Array.isArray(parsed) && typeof parsed[0] === "string" ? [parsed] : parsed
  ) as unknown[];
  return roots.map((root) => new ICAL.Component(root as unknown[]));
}

export function parseIcs(text: string, options: IcsOptions): IcsParseResult {
  const { source, channel, now, timeZone } = options;
  const horizonDays = options.horizonDays ?? DEFAULT_RRULE_HORIZON_DAYS;
  const windowStartKey = dateKeyInZone(now, timeZone);
  const windowStart = startOfDayInZone(windowStartKey, timeZone);
  const horizonEnd = new Date(now.getTime() + horizonDays * DAY_MS);
  const toExternalId = options.externalIdFor ?? ((uid: string) => uid);

  const vevents = parseRoots(text).flatMap((root) => root.getAllSubcomponents("vevent"));
  const masters: IcalComponent[] = [];
  const exceptionsByUid = new Map<string, IcalComponent[]>();
  for (const vevent of vevents) {
    const uid = stringProp(vevent, "uid");
    if (uid && vevent.hasProperty("recurrence-id")) {
      const list = exceptionsByUid.get(uid) ?? [];
      list.push(vevent);
      exceptionsByUid.set(uid, list);
    } else {
      masters.push(vevent);
    }
  }
  // An override whose master is missing is an ordinary event.
  const masterUids = new Set(masters.map((m) => stringProp(m, "uid")).filter(Boolean));
  for (const [uid, list] of exceptionsByUid) {
    if (!masterUids.has(uid)) {
      masters.push(...list);
      exceptionsByUid.delete(uid);
    }
  }

  const items: NormalizedFeedItem[] = [];
  let skipped = 0;

  const build = (
    component: IcalComponent,
    span: Span,
    externalId: string,
    fallbackTitle?: string,
  ): NormalizedFeedItem | null => {
    const title = cleanLine(stringProp(component, "summary") ?? fallbackTitle, TITLE_MAX);
    if (!title) return null;
    const description = stringProp(component, "description");
    const cleaned = description
      ? (options.cleanDescription ?? ((t: string) => t))(normalizeText(htmlToText(description)))
      : "";
    const location = cleanLine(stringProp(component, "location"), LOCATION_MAX) || null;
    const uid = stringProp(component, "uid");
    const url =
      pickItemUrl(source, [stringProp(component, "url"), uid]) ??
      pickItemUrl(source, [options.fallbackUrl]);
    if (!url) return null;
    const durationMs = span.endsAt.getTime() - span.startsAt.getTime();
    return {
      source,
      channel,
      externalId: capExternalId(externalId),
      kind: !span.allDay && durationMs <= DEADLINE_MAX_MS ? "deadline" : "event",
      title,
      url,
      startsAt: span.startsAt,
      endsAt: span.endsAt,
      allDay: span.allDay,
      location,
      summaryText: summaryFromHtml(cleaned),
    };
  };

  for (const master of masters.slice(0, MAX_EVENTS)) {
    try {
      if (isSkippedStatus(master)) continue;
      const uid = stringProp(master, "uid");
      const event = new ICAL.Event(master, {
        exceptions: uid ? (exceptionsByUid.get(uid) ?? []) : [],
        strictExceptions: false,
      });
      const startTzid = tzidParam(master, "dtstart");
      const endTzid = tzidParam(master, "dtend") ?? startTzid;
      const masterTitle = stringProp(master, "summary") ?? undefined;

      if (!event.isRecurring()) {
        const span = spanOf(event.startDate, event.endDate, startTzid, endTzid, timeZone);
        if (endedBefore(span, windowStart)) continue;
        const idBase = uid
          ? toExternalId(uid)
          : `${cleanLine(masterTitle, 80)}@${span.startsAt.toISOString()}`;
        const item = build(master, span, idBase);
        if (item) items.push(item);
        else skipped++;
        continue;
      }

      const idBase = uid ? toExternalId(uid) : cleanLine(masterTitle, 80);
      // Instances whose wall-clock date is this far before today cannot overlap today: skip them cheaply.
      const durationDays = Math.ceil(Math.max(0, event.duration.toSeconds()) / 86_400);
      const earliestKey = addDaysToKey(windowStartKey, -durationDays - 2);
      const iterator = event.iterator();
      for (let step = 0; step < MAX_OCCURRENCE_STEPS; step++) {
        const next = iterator.next();
        if (!next) break;
        if (dateKeyOf(next) < earliestKey) continue;
        const originalStart = icalTimeToInstant(next, startTzid, timeZone);
        if (originalStart.getTime() >= horizonEnd.getTime()) break;
        const details = event.getOccurrenceDetails(next);
        const occurrence = details.item.component;
        if (occurrence !== master && isSkippedStatus(occurrence)) continue;
        const span = spanOf(
          details.startDate,
          details.endDate,
          tzidParam(occurrence, "dtstart") ?? startTzid,
          tzidParam(occurrence, "dtend") ?? tzidParam(occurrence, "dtstart") ?? endTzid,
          timeZone,
        );
        if (span.startsAt.getTime() >= horizonEnd.getTime()) continue;
        if (endedBefore(span, windowStart)) continue;
        const item = build(
          occurrence,
          span,
          `${idBase}#${originalStart.toISOString()}`,
          masterTitle,
        );
        if (item) items.push(item);
        else skipped++;
      }
    } catch {
      skipped++;
    }
  }

  items.sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));
  return { items, skipped };
}

/** Over before today (America/New_York) began; a zero-length deadline at midnight still counts as today. */
function endedBefore(span: Span, windowStart: Date): boolean {
  return (
    span.endsAt.getTime() <= windowStart.getTime() &&
    span.startsAt.getTime() < windowStart.getTime()
  );
}
