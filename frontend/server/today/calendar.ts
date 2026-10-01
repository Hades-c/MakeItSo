import "server-only";
import type { SummaryMilestone } from "@/lib/day-summary";
import type { SourceId } from "@/lib/sources";
import { termLabel, type ClassStanding, type TermCode } from "@/lib/term";
import type { CalendarEvent } from "@/lib/types/content";
import {
  ACADEMIC_CALENDAR,
  calendarBetween,
  eventEndDay,
  isStudentFacing,
} from "@/server/content/academic-calendar";
import { addDays } from "@/server/content/define";
import { zonedInstant } from "@/server/today/time";

/**
 * Today's reading of the Registrar's academic calendar (server/content/academic-calendar.ts): which break a day
 * falls in, the milestones a day's summary names ("WebTree opens today at 7:00 AM"), the WebTree window behind
 * the "Plan Spring 2027" call to action, and whether a row's audience is the student. Pure over curated content.
 */

/** The break (category "break") covering `day`, e.g. "Fall Break"; null on a regular day. */
export function breakOn(day: string, calendar: readonly CalendarEvent[] = ACADEMIC_CALENDAR) {
  const row = calendar.find(
    (event) => event.category === "break" && event.start <= day && day <= eventEndDay(event),
  );
  return row ? { name: row.title, row } : null;
}

const OPENS = /^(.*?)\s+(?:re-)?opens?\b/i;

/**
 * The calendar milestones of one day for the day summary:
 * - a registration window that starts that day: "WebTree opens" ("WebTree Open: Submit Spring 2027 Course
 *   Preferences" → WebTree), "Banner Self-Service Add/Drop opens", or the window's title when it names no opening;
 * - a break that starts that day at a published time (Thanksgiving Break begins at 4:20 PM; a break without a time
 *   is a day off, which the summary's lead already says).
 * Staff-only rows are left out. Single-day registration rows without "Open" (schedules available) are Due soon
 * items, not milestones.
 */
export function milestonesOn(
  day: string,
  calendar: readonly CalendarEvent[] = ACADEMIC_CALENDAR,
): SummaryMilestone[] {
  const out: SummaryMilestone[] = [];
  for (const row of calendar) {
    if (row.start !== day || !isStudentFacing(row)) continue;
    const at = row.time ? zonedInstant(day, row.time) : null;
    if (row.category === "registration") {
      const opens = OPENS.exec(row.title)?.[1]?.trim();
      if (opens) out.push({ name: opens, verb: "opens", at, day });
      else if (row.end) out.push({ name: row.title, verb: "opens", at, day });
    } else if (row.category === "break" && row.time) {
      out.push({ name: row.title, verb: "begins", at, day });
    }
  }
  return out;
}

/** Standing words in a calendar or program audience ("Seniors (Class of 2027)", "Sophomores, juniors, and seniors"). */
const STANDING_WORDS: readonly { standing: ClassStanding; pattern: RegExp }[] = [
  { standing: "first-year", pattern: /\b(first[- ]years?|freshm[ae]n|new students?)\b/i },
  { standing: "sophomore", pattern: /\bsophomores?\b/i },
  { standing: "junior", pattern: /\bjuniors?\b/i },
  { standing: "senior", pattern: /\bseniors?\b/i },
];

/**
 * Whether a row's audience certainly includes the student: true for no audience or "All students"; for an audience
 * that names class years, whether it names the student's (an incoming student counts as a new student); false for
 * a conditional audience ("Students planning a January graduation"), which Today lists but never counts as the
 * student's own deadline.
 */
export function audienceIncludes(audience: string | null, standing: ClassStanding | null): boolean {
  if (audience === null || !audience.trim()) return true;
  if (/\ball students\b/i.test(audience)) return true;
  const named = STANDING_WORDS.filter((word) => word.pattern.test(audience));
  if (named.length === 0) return false;
  const own = standing === "incoming" ? "first-year" : standing;
  return named.some((word) => word.standing === own);
}

/** Student-facing deadline rows (category "deadline") on the Davidson days from..to, for the day summary. */
export function calendarDeadlineRows(
  from: string,
  to: string,
  standing: ClassStanding | null,
): CalendarEvent[] {
  return calendarBetween(from, to, { categories: ["deadline"] }).filter(
    (row) => row.start >= from && audienceIncludes(row.audience, standing),
  );
}

/** Days before WebTree opens from which Today shows the "Plan <term>" call to action. */
export const WEBTREE_LEAD_DAYS = 14;

export interface WebTreeWindow {
  termCode: TermCode;
  /** "Spring 2027". */
  termLabel: string;
  opensAt: Date;
  closesAt: Date;
  /** upcoming: within WEBTREE_LEAD_DAYS of opening; open: preferences can be submitted now. */
  state: "upcoming" | "open";
  source: SourceId;
  url: string;
  verifiedAt: string;
}

/**
 * The WebTree preference window for the registration term, from the calendar's "WebTree Open: Submit <term> Course
 * Preferences" row (opening day and time) and its "WebTree Closes (<term> Preferences Due)" row (closing time; the
 * window's last day at midnight when there is none). Null outside [opens − WEBTREE_LEAD_DAYS days, closes) or when
 * the calendar has no window for that term.
 */
export function webTreeWindow(
  registrationTerm: TermCode,
  at: Date,
  calendar: readonly CalendarEvent[] = ACADEMIC_CALENDAR,
): WebTreeWindow | null {
  const label = termLabel(registrationTerm);
  const open = calendar.find(
    (row) =>
      row.category === "registration" && /webtree/i.test(row.title) && row.title.includes(label),
  );
  if (!open) return null;
  const lastDay = eventEndDay(open);
  const close = calendar.find(
    (row) =>
      row.category === "deadline" &&
      /webtree closes/i.test(row.title) &&
      row.title.includes(label) &&
      row.start === lastDay,
  );
  const opensAt = zonedInstant(open.start, open.time ?? "00:00");
  const closesAt = close?.time
    ? zonedInstant(lastDay, close.time)
    : zonedInstant(addDays(lastDay, 1), "00:00");
  const t = at.getTime();
  if (t >= closesAt.getTime()) return null;
  if (t < opensAt.getTime() - WEBTREE_LEAD_DAYS * 86_400_000) return null;
  return {
    termCode: registrationTerm,
    termLabel: label,
    opensAt,
    closesAt,
    state: t < opensAt.getTime() ? "upcoming" : "open",
    source: open.source,
    url: open.sources[0] ?? "",
    verifiedAt: open.verifiedAt,
  };
}
