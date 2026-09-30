/**
 * The Today headline (Broadsheet idea adopted for Lakeside): one plain sentence that sums up the student's day,
 * built deterministically from their schedule, deadlines and campus events. No model writes it, so it is always
 * true to the data shown below it and identical on every render.
 *
 *   "Three classes today, starting with CSC 221 at 10:30 AM, and Problem set (CSC 221) is due Thursday."
 *   "You're in ECO 232 until 12:20 PM, then one more class, and two deadlines in the next three days, the
 *    first tomorrow at 5:00 PM."
 *   "Classes are done for today, and Career & internship fair is at 4:00 PM."
 *   "No classes today and nothing due in the next three days."
 *
 * All day boundaries are computed in the given IANA time zone (America/New_York for Davidson), never in the
 * server's or browser's local zone. Pure: pass `now` explicitly.
 */

import {
  calendarDaysBetween,
  dayKey,
  DEFAULT_TIME_ZONE,
  formatTime,
  formatWeekday,
} from "./format";

export interface SummaryClass {
  /** Course code, e.g. "CSC 221". */
  code: string;
  start: Date;
  end: Date;
}

export interface SummaryDeadline {
  title: string;
  due: Date;
  courseCode?: string;
}

export interface SummaryEvent {
  title: string;
  start: Date;
}

export interface DaySummaryInput {
  now: Date;
  timeZone?: string;
  /**
   * False when the student has no schedule for the current term yet (nothing to summarise). Classes may still be
   * empty on a day off when this is true.
   */
  hasSchedule: boolean;
  /** Class meetings; only those on today's date (in the zone) are used. */
  classes?: readonly SummaryClass[];
  deadlines?: readonly SummaryDeadline[];
  events?: readonly SummaryEvent[];
}

export interface DaySummary {
  sentence: string;
  classesToday: number;
  classesLeft: number;
  /** Deadlines due from now through the next DEADLINE_WINDOW_DAYS days. */
  deadlinesSoon: number;
  /** Campus events later today. */
  eventsLeftToday: number;
}

/** How far ahead "due soon" looks, in days. */
export const DEADLINE_WINDOW_DAYS = 3;

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "one class", "three classes", "12 classes". */
function count(n: number, singular: string, plural = `${singular}s`): string {
  const word = n < WORDS.length ? (WORDS[n] ?? String(n)) : String(n);
  return `${word} ${n === 1 ? singular : plural}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "today at 11:59 PM", "tomorrow at 5:00 PM", "Thursday". */
function when(date: Date, now: Date, timeZone: string): string {
  const days = calendarDaysBetween(now, date, timeZone);
  if (days <= 0) return `today at ${formatTime(date, timeZone)}`;
  if (days === 1) return `tomorrow at ${formatTime(date, timeZone)}`;
  return formatWeekday(date, timeZone);
}

function byStart<T extends { start: Date }>(a: T, b: T): number {
  return a.start.getTime() - b.start.getTime();
}

export function buildDaySummary(input: DaySummaryInput): DaySummary {
  const { now } = input;
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const today = dayKey(now, timeZone);
  const t = now.getTime();

  const classesToday = (input.classes ?? [])
    .filter((c) => dayKey(c.start, timeZone) === today)
    .slice()
    .sort(byStart);
  const remaining = classesToday.filter((c) => c.end.getTime() > t);
  const current = remaining.find((c) => c.start.getTime() <= t);
  const upcoming = remaining.filter((c) => c.start.getTime() > t);

  const windowEnd = t + DEADLINE_WINDOW_DAYS * 86_400_000;
  const deadlines = (input.deadlines ?? [])
    .filter((d) => d.due.getTime() >= t && d.due.getTime() <= windowEnd)
    .slice()
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  const events = (input.events ?? [])
    .filter((e) => e.start.getTime() >= t && dayKey(e.start, timeZone) === today)
    .slice()
    .sort(byStart);

  const facts = {
    classesToday: classesToday.length,
    classesLeft: remaining.length,
    deadlinesSoon: deadlines.length,
    eventsLeftToday: events.length,
  };

  // Lead clause: where the day stands.
  let lead: string | null;
  if (!input.hasSchedule) {
    lead = null;
  } else if (classesToday.length === 0) {
    lead = "no classes today";
  } else if (current) {
    lead = `you're in ${current.code} until ${formatTime(current.end, timeZone)}`;
    if (upcoming.length > 0)
      lead += `, then ${count(upcoming.length, "more class", "more classes")}`;
  } else if (upcoming.length === 0) {
    lead = "classes are done for today";
  } else {
    const next = upcoming[0] as SummaryClass;
    const at = `${next.code} at ${formatTime(next.start, timeZone)}`;
    lead =
      upcoming.length === classesToday.length
        ? `${count(upcoming.length, "class", "classes")} today, starting with ${at}`
        : `${count(upcoming.length, "class", "classes")} left today, next ${at}`;
  }

  // Second clause: the most pressing thing coming up (a deadline beats an event).
  let follow: string | null = null;
  const firstDeadline = deadlines[0];
  const firstEvent = events[0];
  if (deadlines.length === 1 && firstDeadline) {
    const course = firstDeadline.courseCode ? ` (${firstDeadline.courseCode})` : "";
    follow = `${firstDeadline.title}${course} is due ${when(firstDeadline.due, now, timeZone)}`;
  } else if (deadlines.length > 1 && firstDeadline) {
    follow = `${count(deadlines.length, "deadline")} in the next ${count(DEADLINE_WINDOW_DAYS, "day")}, the first ${when(
      firstDeadline.due,
      now,
      timeZone,
    )}`;
  } else if (events.length === 1 && firstEvent) {
    follow = `${firstEvent.title} is at ${formatTime(firstEvent.start, timeZone)}`;
  } else if (events.length > 1 && firstEvent) {
    follow = `${count(events.length, "campus event")} later today, starting at ${formatTime(
      firstEvent.start,
      timeZone,
    )}`;
  }

  const horizon = `the next ${count(DEADLINE_WINDOW_DAYS, "day")}`;
  let sentence: string;
  if (lead && follow) {
    sentence = `${capitalize(lead)}, and ${follow}.`;
  } else if (lead === "no classes today") {
    sentence = `No classes today and nothing due in ${horizon}.`;
  } else if (lead) {
    sentence = `${capitalize(lead)}, and nothing is due in ${horizon}.`;
  } else if (follow) {
    sentence = `${capitalize(follow)}.`;
  } else {
    sentence = "Nothing on your calendar yet.";
  }

  return { sentence, ...facts };
}
