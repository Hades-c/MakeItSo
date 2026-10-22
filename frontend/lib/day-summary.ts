/**
 * The Today headline (Broadsheet idea adopted for Lakeside): one plain sentence that sums up the student's day,
 * built deterministically from their schedule, deadlines, the academic calendar and campus events. No model
 * writes it, so it is always true to the data shown below it and identical on every render.
 *
 *   "Three classes today, starting with CSC 221 at 10:30 AM, and Problem set (CSC 221) is due Thursday."
 *   "You're in ECO 232 until 12:20 PM, then one more class, and two deadlines in the next three days, the
 *    first tomorrow at 5:00 PM."
 *   "Classes are done for today, and Career & internship fair is at 4:00 PM."
 *   "No classes today for Fall Break and nothing due in the next three days."
 *   "No classes today, and WebTree opens today at 7:00 AM."
 *
 * The sentence is a lead clause (where the day stands: classes, or why there are none) and at most one follow-up,
 * the most pressing thing ahead, in this order: a calendar milestone today (WebTree opens), the deadlines due in
 * the next DEADLINE_WINDOW_DAYS days, then campus events later today.
 *
 * All day boundaries are computed in the given IANA time zone (America/New_York for Davidson), never in the
 * server's or browser's local zone, so DST changes (2026-11-01, 2027-03-14) move nothing. Pure: pass `now`.
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
  /** When it is due; for an all-day deadline any instant on that Davidson day. */
  due: Date;
  courseCode?: string;
  /** Due on a day without a published time (academic calendar rows, program deadlines). */
  allDay?: boolean;
}

export interface SummaryEvent {
  title: string;
  start: Date;
}

/** Something the academic calendar marks for today: "WebTree opens", "Thanksgiving Break begins". */
export interface SummaryMilestone {
  /** What it is, e.g. "WebTree". */
  name: string;
  verb: "opens" | "reopens" | "closes" | "begins" | "ends";
  /** The published time, or null when the row has none. */
  at: Date | null;
  /** The Davidson day it happens on ("YYYY-MM-DD"); needed when `at` is null. */
  day?: string;
}

/** Why there are no classes today (lib/types/plan DaySchedule.empty). */
export type NoClassesReason = "weekend" | "break" | "no-term" | "no-sections" | "no-classes-today";

export interface DaySummaryInput {
  now: Date;
  timeZone?: string;
  /**
   * False when the student has no schedule for the current term yet (nothing to summarise). Classes may still be
   * empty on a day off when this is true.
   */
  hasSchedule: boolean;
  /** False until the student has finished first-run setup (onboardedAt unset). Default true. */
  onboarded?: boolean;
  /** Why `classes` has nothing today, when the caller knows (the day schedule's `empty`). */
  noClasses?: NoClassesReason | null;
  /** The break today, e.g. "Fall Break" (with noClasses "break"). */
  breakName?: string;
  /** The term in session, e.g. "Fall 2026" (named when no sections are chosen). */
  termLabel?: string;
  /** Class meetings; only those on today's date (in the zone) are used. */
  classes?: readonly SummaryClass[];
  deadlines?: readonly SummaryDeadline[];
  events?: readonly SummaryEvent[];
  /** Calendar milestones; only those on today's date are used. */
  milestones?: readonly SummaryMilestone[];
}

export interface DaySummary {
  sentence: string;
  classesToday: number;
  classesLeft: number;
  /** Deadlines due from now through the next DEADLINE_WINDOW_DAYS days. */
  deadlinesSoon: number;
  /** Campus events later today. */
  eventsLeftToday: number;
  /** Calendar milestones today. */
  milestonesToday: number;
}

/** How far ahead "due soon" looks, in days. */
export const DEADLINE_WINDOW_DAYS = 3;

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "one class", "three classes", "12 classes". */
export function countWords(n: number, singular: string, plural = `${singular}s`): string {
  const word = n >= 0 && n < WORDS.length ? (WORDS[n] ?? String(n)) : String(n);
  return `${word} ${n === 1 ? singular : plural}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PAST: Record<SummaryMilestone["verb"], string> = {
  opens: "opened",
  reopens: "reopened",
  closes: "closed",
  begins: "began",
  ends: "ended",
};

/** "today at 11:59 PM", "tomorrow at 5:00 PM", "Thursday"; all-day: "today", "tomorrow", "Thursday". */
function when(deadline: SummaryDeadline, now: Date, timeZone: string): string {
  const days = calendarDaysBetween(now, deadline.due, timeZone);
  const at = deadline.allDay ? "" : ` at ${formatTime(deadline.due, timeZone)}`;
  if (days <= 0) return `today${at}`;
  if (days === 1) return `tomorrow${at}`;
  return formatWeekday(deadline.due, timeZone);
}

function byStart<T extends { start: Date }>(a: T, b: T): number {
  return a.start.getTime() - b.start.getTime();
}

/**
 * In the window: due today through day DEADLINE_WINDOW_DAYS, by Davidson calendar day for timed and all-day
 * deadlines alike (Saturday 9 a.m. and Saturday 1 p.m. are both "Saturday"); a timed deadline whose time has passed
 * is gone.
 */
function isDueSoon(deadline: SummaryDeadline, now: Date, timeZone: string): boolean {
  const due = deadline.due.getTime();
  if (Number.isNaN(due)) return false;
  if (!deadline.allDay && due < now.getTime()) return false;
  const days = calendarDaysBetween(now, deadline.due, timeZone);
  return days >= 0 && days <= DEADLINE_WINDOW_DAYS;
}

/** The lead clause for a day without classes. */
function noClassLead(input: DaySummaryInput): string {
  switch (input.noClasses) {
    case "weekend":
      return "no classes this weekend";
    case "break":
      return input.breakName ? `no classes today for ${input.breakName}` : "no classes today";
    case "no-sections":
      return input.termLabel
        ? `no ${input.termLabel} class sections in your plan yet`
        : "no class sections in your plan yet";
    default:
      return "no classes today";
  }
}

function milestoneClause(m: SummaryMilestone, now: Date, timeZone: string): string {
  if (!m.at) return `${m.name} ${m.verb} today`;
  const time = formatTime(m.at, timeZone);
  return m.at.getTime() > now.getTime()
    ? `${m.name} ${m.verb} today at ${time}`
    : `${m.name} ${PAST[m.verb]} today at ${time}`;
}

export function buildDaySummary(input: DaySummaryInput): DaySummary {
  const { now } = input;
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const today = dayKey(now, timeZone);
  const t = now.getTime();
  const onboarded = input.onboarded ?? true;

  const classesToday = (input.classes ?? [])
    .filter((c) => dayKey(c.start, timeZone) === today)
    .slice()
    .sort(byStart);
  const remaining = classesToday.filter((c) => c.end.getTime() > t);
  const current = remaining.find((c) => c.start.getTime() <= t);
  const upcoming = remaining.filter((c) => c.start.getTime() > t);

  const deadlines = (input.deadlines ?? [])
    .filter((d) => isDueSoon(d, now, timeZone))
    .slice()
    .sort((a, b) => {
      // On one day an all-day deadline sorts first (it has no time of its own).
      const days = calendarDaysBetween(b.due, a.due, timeZone);
      if (days !== 0) return days;
      if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
      return a.due.getTime() - b.due.getTime();
    });

  const events = (input.events ?? [])
    .filter((e) => e.start.getTime() >= t && dayKey(e.start, timeZone) === today)
    .slice()
    .sort(byStart);

  const milestones = (input.milestones ?? [])
    .filter((m) => (m.at ? dayKey(m.at, timeZone) : m.day) === today)
    .slice()
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));

  const facts = {
    classesToday: classesToday.length,
    classesLeft: remaining.length,
    deadlinesSoon: deadlines.length,
    eventsLeftToday: events.length,
    milestonesToday: milestones.length,
  };

  // Lead clause: where the day stands.
  let lead: string | null;
  if (!onboarded || !input.hasSchedule) {
    lead = null;
  } else if (classesToday.length === 0) {
    lead = noClassLead(input);
  } else if (current) {
    lead = `you're in ${current.code} until ${formatTime(current.end, timeZone)}`;
    if (upcoming.length > 0)
      lead += `, then ${countWords(upcoming.length, "more class", "more classes")}`;
  } else if (upcoming.length === 0) {
    lead = "classes are done for today";
  } else {
    const next = upcoming[0] as SummaryClass;
    const at = `${next.code} at ${formatTime(next.start, timeZone)}`;
    lead =
      upcoming.length === classesToday.length
        ? `${countWords(upcoming.length, "class", "classes")} today, starting with ${at}`
        : `${countWords(upcoming.length, "class", "classes")} left today, next ${at}`;
  }

  // Follow-up: the most pressing thing ahead (a calendar milestone, then deadlines, then an event).
  let follow: string | null = null;
  const firstMilestone = milestones[0];
  const firstDeadline = deadlines[0];
  const firstEvent = events[0];
  if (firstMilestone) {
    follow = milestoneClause(firstMilestone, now, timeZone);
  } else if (deadlines.length === 1 && firstDeadline) {
    const course = firstDeadline.courseCode ? ` (${firstDeadline.courseCode})` : "";
    follow = `${firstDeadline.title}${course} is due ${when(firstDeadline, now, timeZone)}`;
  } else if (deadlines.length > 1 && firstDeadline) {
    follow = `${countWords(deadlines.length, "deadline")} in the next ${countWords(
      DEADLINE_WINDOW_DAYS,
      "day",
    )}, the first ${when(firstDeadline, now, timeZone)}`;
  } else if (events.length === 1 && firstEvent) {
    follow = `${firstEvent.title} is at ${formatTime(firstEvent.start, timeZone)}`;
  } else if (events.length > 1 && firstEvent) {
    follow = `${countWords(events.length, "campus event")} later today, starting at ${formatTime(
      firstEvent.start,
      timeZone,
    )}`;
  }

  const horizon = `the next ${countWords(DEADLINE_WINDOW_DAYS, "day")}`;
  let sentence: string;
  if (!onboarded) {
    sentence = follow
      ? `${capitalize(follow)}; finish setting up MakeItSo to see your classes here.`
      : "Finish setting up MakeItSo to see your classes, deadlines and campus events here.";
  } else if (lead && follow) {
    sentence = `${capitalize(lead)}, and ${follow}.`;
  } else if (lead?.startsWith("no ")) {
    sentence = `${capitalize(lead)} and nothing due in ${horizon}.`;
  } else if (lead) {
    sentence = `${capitalize(lead)}, and nothing is due in ${horizon}.`;
  } else if (follow) {
    sentence = `${capitalize(follow)}.`;
  } else {
    sentence = "Nothing on your calendar yet.";
  }

  return { sentence, ...facts };
}
