import "server-only";
import ICAL from "ical.js";
import {
  cleanLine,
  HTML_INPUT_MAX,
  htmlToText,
  LOCATION_MAX,
  sliceText,
  summaryFromText,
  TITLE_MAX,
} from "@/server/feeds/text";
import {
  addDaysToKey,
  dateKeyInZone,
  DAY_MS,
  daysBetweenKeys,
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
 *   - Recurrence (RRULE, RDATE, EXDATE, RECURRENCE-ID) is expanded for the next `horizonDays` (30) days. ical.js
 *     iterates the RRULE only; DTSTART, RDATE, EXDATE and overrides are matched here by instant (ical.js compares
 *     them as wall-clock values, which breaks for a TZID without a VTIMEZONE next to a UTC EXDATE). DTSTART is
 *     always the first instance (also with RDATE and no RRULE). Each instance gets the externalId
 *     "<uid>#<original start ISO>", so a moved instance keeps its identity; an override is kept or dropped by
 *     its new time (postponed from the past, or moved into the next 30 days, it is listed).
 *   - Expansion is bounded (ICS_LIMITS): instances per event, iterator steps per event and per document, a CPU
 *     budget, events per document and items per document. Sub-hourly rules, and rules ical.js would spin on
 *     forever (FREQ=DAILY;BYMONTHDAY=-1, FREQ=DAILY;BYDAY=1MO, ...), are skipped. Whatever a limit cuts is
 *     counted in `capped`, so the sync is not recorded as a clean success.
 *   - STATUS:CANCELLED (event or instance) and CLASS:PRIVATE/CONFIDENTIAL events are skipped; so is anything that
 *     ended before today (America/New_York). Events whose fields cannot be read are counted in `skipped`.
 */

export interface IcsLimits {
  /** Instances one recurring event may add inside the horizon (the soonest are kept). */
  instancesPerEvent: number;
  /** RRULE iterator steps for one event (counted from DTSTART, so a far-past series costs steps too). */
  stepsPerEvent: number;
  /** RRULE iterator steps for the whole document. */
  stepsPerDocument: number;
  /**
   * CPU budget in ms, from the start of the parse, after which recurring events are no longer expanded
   * (performance.now(): a work limit, not a business clock).
   */
  expansionMs: number;
  /** VEVENTs read from one document. */
  events: number;
  /** Items one document may produce (the soonest are kept). */
  items: number;
}

export const ICS_LIMITS: Readonly<IcsLimits> = {
  instancesPerEvent: 100,
  stepsPerEvent: 20_000,
  stepsPerDocument: 100_000,
  expansionMs: 1_000,
  events: 5_000,
  items: 3_000,
};

export interface IcsOptions extends ParseContext {
  /** Link for events without a usable URL (must pass the source's allow-list). */
  fallbackUrl: string;
  /** RRULE expansion horizon in days (default 30). */
  horizonDays?: number;
  /** Map an upstream UID to the stored externalId (e.g. Hurt Hub post ids shared with the Tribe fallback). */
  externalIdFor?: (uid: string) => string;
  /** Source-specific cleanup of the description text before it becomes the summary. */
  cleanDescription?: (text: string) => string;
  /** Override expansion limits (tests). */
  limits?: Partial<IcsLimits>;
}

export interface IcsParseResult {
  items: NormalizedFeedItem[];
  /** Events that could not be read (bad dates, no title, unsupported recurrence rule). */
  skipped: number;
  /** Events (or items) cut by an expansion or size limit. */
  capped: number;
}

export const DEFAULT_RRULE_HORIZON_DAYS = 30;
/** Deadline threshold: events this short (or shorter) are deadlines. */
export const DEADLINE_MAX_MS = MINUTE_MS;
const MAX_EXTERNAL_ID = 400;

type IcalTime = ICAL.Time;
type IcalComponent = ICAL.Component;
type IcalRecur = ICAL.Recur;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKeyOf(time: IcalTime): string {
  return `${String(time.year).padStart(4, "0")}-${pad(time.month)}-${pad(time.day)}`;
}

/** The TZID parameter of a component's first `property` (DTSTART, DTEND, RECURRENCE-ID). */
function tzidOf(component: IcalComponent, property: string): string | null {
  const value = component.getFirstProperty(property)?.getParameter("tzid");
  return typeof value === "string" && value ? value : null;
}

/**
 * The instant of a DATE-TIME value. `tzid` is the TZID parameter of the property the value came from (ical.js
 * treats a TZID without a VTIMEZONE as floating, so callers pass it explicitly).
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

interface TimedValue {
  time: IcalTime;
  instant: Date;
}

/** Every value of a date-list property (RDATE, EXDATE) with its instant; a PERIOD counts from its start. */
function listTimes(
  component: IcalComponent,
  name: "rdate" | "exdate",
  fallbackTzid: string | null,
  campusTimeZone: string,
): TimedValue[] {
  const values: TimedValue[] = [];
  for (const property of component.getAllProperties(name)) {
    const param = property.getParameter("tzid");
    const tzid = typeof param === "string" && param ? param : fallbackTzid;
    for (const value of property.getValues() as unknown[]) {
      const time = value instanceof ICAL.Period ? value.start : value;
      if (!(time instanceof ICAL.Time)) continue;
      values.push({ time, instant: icalTimeToInstant(time, tzid, campusTimeZone) });
    }
  }
  return values;
}

const PLAIN_WEEKDAY = /^(?:MO|TU|WE|TH|FR|SA|SU)$/;
/** Longest month lengths (February 29). */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Why a recurrence rule is not expanded, or null. Sub-hourly rules are never campus events. For HOURLY, DAILY and
 * WEEKLY rules ical.js filters candidates one step at a time with no stop (MONTHLY and YEARLY give up after a
 * full cycle), so a rule whose contracting parts can never match would loop forever: BYDAY with only ordinals
 * ("1MO"), BYMONTHDAY with only negative or impossible days (-1, Feb 30), BYWEEKNO/BYYEARDAY (RFC 5545 forbids
 * them with these frequencies). HOURLY rules may not filter by month or month day (years between matches).
 */
export function unsupportedRecurrence(rule: IcalRecur): string | null {
  const freq = rule.freq;
  if (freq === "SECONDLY" || freq === "MINUTELY") return `FREQ=${freq}`;
  if (freq !== "HOURLY" && freq !== "DAILY" && freq !== "WEEKLY") return null;
  const parts = rule.parts;
  if (parts.BYWEEKNO?.length || parts.BYYEARDAY?.length) {
    return `BYWEEKNO/BYYEARDAY with FREQ=${freq}`;
  }
  if (freq === "WEEKLY") return null;
  if (freq === "HOURLY" && (parts.BYMONTH?.length || parts.BYMONTHDAY?.length)) {
    return "BYMONTH/BYMONTHDAY with FREQ=HOURLY";
  }
  if (parts.BYDAY?.length && !parts.BYDAY.some((day) => PLAIN_WEEKDAY.test(String(day)))) {
    return `BYDAY=${parts.BYDAY.join(",")} with FREQ=${freq}`;
  }
  if (parts.BYMONTHDAY?.length) {
    const months = parts.BYMONTH?.length
      ? parts.BYMONTH.map(Number)
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const days = parts.BYMONTHDAY.map(Number).filter((day) => day >= 1);
    const possible = days.some((day) =>
      months.some((month) => day <= (MONTH_DAYS[month - 1] ?? 0)),
    );
    if (!possible) return `BYMONTHDAY=${parts.BYMONTHDAY.join(",")} never matches`;
  }
  return null;
}

/** Split the document into VCALENDAR roots (ical.js returns one root or an array of roots). */
function parseRoots(text: string): IcalComponent[] {
  const body = text.replace(/^﻿/, "");
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

interface PendingInstance {
  component: IcalComponent;
  span: Span;
  /** Start of the instance this is (the RECURRENCE-ID for an override): the externalId suffix. */
  original: Date;
}

export function parseIcs(text: string, options: IcsOptions): IcsParseResult {
  const { source, channel, now, timeZone } = options;
  const limits: IcsLimits = { ...ICS_LIMITS, ...options.limits };
  const horizonDays = options.horizonDays ?? DEFAULT_RRULE_HORIZON_DAYS;
  const windowStartKey = dateKeyInZone(now, timeZone);
  const windowStart = startOfDayInZone(windowStartKey, timeZone);
  const horizonEnd = new Date(now.getTime() + horizonDays * DAY_MS);
  const toExternalId = options.externalIdFor ?? ((uid: string) => uid);
  const cleanDescription = options.cleanDescription ?? ((value: string) => value);

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

  let items: NormalizedFeedItem[] = [];
  let skipped = 0;
  let capped = Math.max(0, masters.length - limits.events);

  // One expansion budget for the whole document.
  let documentSteps = 0;
  const deadline = performance.now() + limits.expansionMs;
  let outOfBudget = false;
  const budgetLeft = (): boolean => {
    if (
      !outOfBudget &&
      (documentSteps >= limits.stepsPerDocument || performance.now() > deadline)
    ) {
      outOfBudget = true;
    }
    return !outOfBudget;
  };

  const build = (
    component: IcalComponent,
    span: Span,
    externalId: string,
    fallbackTitle?: string,
  ): NormalizedFeedItem | null => {
    const title = cleanLine(stringProp(component, "summary") ?? fallbackTitle, TITLE_MAX);
    if (!title) return null;
    const description = stringProp(component, "description");
    // Decoded once here; the summary is cut from the plain text (no second entity pass).
    const text = description
      ? cleanDescription(htmlToText(sliceText(description, HTML_INPUT_MAX)))
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
      summaryText: summaryFromText(text),
    };
  };

  const inWindow = (span: Span) =>
    span.startsAt.getTime() < horizonEnd.getTime() && !endedBefore(span, windowStart);

  for (const master of masters.slice(0, limits.events)) {
    try {
      if (isSkippedStatus(master)) continue;
      const uid = stringProp(master, "uid");
      const startTzid = tzidOf(master, "dtstart");
      const endTzid = tzidOf(master, "dtend") ?? startTzid;
      const masterTitle = stringProp(master, "summary") ?? undefined;
      const rdates = listTimes(master, "rdate", startTzid, timeZone);
      const exdates = listTimes(master, "exdate", startTzid, timeZone);
      // Applied below by instant; ical.js iterates the RRULE alone.
      master.removeAllProperties("rdate");
      master.removeAllProperties("exdate");
      const event = new ICAL.Event(master);
      const rules = master
        .getAllProperties("rrule")
        .map((property) => property.getFirstValue())
        .filter((value): value is IcalRecur => value instanceof ICAL.Recur);
      const masterSpan = spanOf(event.startDate, event.endDate, startTzid, endTzid, timeZone);

      if (rules.length === 0 && rdates.length === 0) {
        if (endedBefore(masterSpan, windowStart)) continue;
        let id = uid
          ? toExternalId(uid)
          : `${cleanLine(masterTitle, 80)}@${masterSpan.startsAt.toISOString()}`;
        // An override without its master: one item per instance.
        const recurrenceId = master.getFirstPropertyValue("recurrence-id");
        if (uid && recurrenceId instanceof ICAL.Time) {
          const tzid = tzidOf(master, "recurrence-id") ?? startTzid;
          id = `${id}#${icalTimeToInstant(recurrenceId, tzid, timeZone).toISOString()}`;
        }
        const item = build(master, masterSpan, id);
        if (item) items.push(item);
        else skipped++;
        continue;
      }

      if (rules.some((rule) => unsupportedRecurrence(rule) !== null)) {
        skipped++;
        continue;
      }
      if (rules.length > 0 && !budgetLeft()) {
        capped++;
        continue;
      }

      const idBase = uid ? toExternalId(uid) : cleanLine(masterTitle, 80);
      const excludedInstants = new Set(exdates.map((value) => value.instant.getTime()));
      // A DATE EXDATE on a DATE-TIME series removes that day's instances (as ical.js does).
      const excludedDays = new Set(
        exdates.filter((value) => value.time.isDate).map((value) => dateKeyOf(value.time)),
      );
      const isExcluded = (time: IcalTime, instant: Date) =>
        excludedInstants.has(instant.getTime()) ||
        (!time.isDate && excludedDays.has(dateKeyInZone(instant, timeZone)));

      const allDayDays = masterSpan.allDay
        ? Math.max(
            1,
            daysBetweenKeys(
              dateKeyInZone(masterSpan.startsAt, timeZone),
              dateKeyInZone(masterSpan.endsAt, timeZone),
            ),
          )
        : 1;
      const durationMs = masterSpan.endsAt.getTime() - masterSpan.startsAt.getTime();
      /** An instance with the series' length: whole days when all-day, the exact duration otherwise. */
      const instanceSpan = (time: IcalTime, instant: Date): Span => {
        if (time.isDate) {
          const key = dateKeyOf(time);
          return {
            startsAt: startOfDayInZone(key, timeZone),
            endsAt: startOfDayInZone(addDaysToKey(key, allDayDays), timeZone),
            allDay: true,
          };
        }
        return {
          startsAt: instant,
          endsAt: new Date(instant.getTime() + durationMs),
          allDay: false,
        };
      };

      const pending: PendingInstance[] = [];
      let cut = false;

      // Overrides, keyed by the instant of the instance they replace; kept or dropped by their own new time.
      const overridden = new Set<number>();
      for (const exception of uid ? (exceptionsByUid.get(uid) ?? []) : []) {
        const recurrenceId = exception.getFirstPropertyValue("recurrence-id");
        if (!(recurrenceId instanceof ICAL.Time)) continue;
        const original = icalTimeToInstant(
          recurrenceId,
          tzidOf(exception, "recurrence-id") ?? startTzid,
          timeZone,
        );
        if (overridden.has(original.getTime())) continue;
        overridden.add(original.getTime());
        if (isExcluded(recurrenceId, original) || isSkippedStatus(exception)) continue;
        let span: Span;
        if (!exception.hasProperty("dtstart")) {
          span = instanceSpan(recurrenceId, original);
        } else {
          const own = new ICAL.Event(exception);
          const ownTzid = tzidOf(exception, "dtstart") ?? startTzid;
          span =
            exception.hasProperty("dtend") || exception.hasProperty("duration")
              ? spanOf(
                  own.startDate,
                  own.endDate,
                  ownTzid,
                  tzidOf(exception, "dtend") ?? ownTzid,
                  timeZone,
                )
              : instanceSpan(own.startDate, icalTimeToInstant(own.startDate, ownTzid, timeZone));
        }
        if (inWindow(span)) pending.push({ component: exception, span, original });
      }

      const seen = new Set<number>();
      const consider = (time: IcalTime, instant: Date): void => {
        const key = instant.getTime();
        if (seen.has(key)) return;
        seen.add(key);
        if (overridden.has(key) || isExcluded(time, instant)) return;
        const span = instanceSpan(time, instant);
        if (inWindow(span)) pending.push({ component: master, span, original: instant });
      };
      // DTSTART is the first instance; with an RRULE the iterator yields it.
      if (rules.length === 0) consider(event.startDate, masterSpan.startsAt);
      for (const rdate of rdates) consider(rdate.time, rdate.instant);

      if (rules.length > 0) {
        // Instances whose wall-clock date is this far before today cannot overlap today: skip them cheaply.
        const durationDays = Math.ceil(Math.max(0, durationMs) / DAY_MS) + allDayDays;
        const earliestKey = addDaysToKey(windowStartKey, -durationDays - 2);
        const before = pending.length;
        const iterator = event.iterator();
        for (let step = 0; ; step++) {
          if (step >= limits.stepsPerEvent || ((step & 255) === 0 && !budgetLeft())) {
            cut = true;
            break;
          }
          documentSteps++;
          const next = iterator.next();
          if (!next) break;
          if (dateKeyOf(next) < earliestKey) continue;
          const instant = icalTimeToInstant(next, startTzid, timeZone);
          if (instant.getTime() >= horizonEnd.getTime()) break;
          consider(next, instant);
          // Rule instances arrive in order: once past the per-event limit, the rest start later still.
          if (pending.length - before > limits.instancesPerEvent) break;
        }
      }

      pending.sort((a, b) => a.span.startsAt.getTime() - b.span.startsAt.getTime());
      if (pending.length > limits.instancesPerEvent) {
        pending.length = limits.instancesPerEvent;
        cut = true;
      }
      if (cut) capped++;
      let built = 0;
      for (const instance of pending) {
        const item = build(
          instance.component,
          instance.span,
          `${idBase}#${instance.original.toISOString()}`,
          masterTitle,
        );
        if (item) {
          items.push(item);
          built++;
        }
      }
      if (pending.length > 0 && built === 0) skipped++;
    } catch {
      skipped++;
    }
  }

  items.sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));
  if (items.length > limits.items) {
    capped += items.length - limits.items;
    items = items.slice(0, limits.items);
  }
  return { items, skipped, capped };
}

/** Over before today (America/New_York) began; a zero-length deadline at midnight still counts as today. */
function endedBefore(span: Span, windowStart: Date): boolean {
  return (
    span.endsAt.getTime() <= windowStart.getTime() &&
    span.startsAt.getTime() < windowStart.getTime()
  );
}
