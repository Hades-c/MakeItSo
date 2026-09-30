import "server-only";
import { dayKey } from "@/lib/format";
import { compareTerms, isRegularTerm, type TermCode } from "@/lib/term";
import type { MeetingDay, ResolvedTerms, Section } from "@/lib/types/catalog";
import type { DaySchedule, DayScheduleEntry, PlanItem, StudentDeadline } from "@/lib/types/plan";
import { calendarForTerm, eventEndDay } from "@/server/content/academic-calendar";
import { lookupSection } from "@/server/plan/catalog";
import { areSiblings, isTimedMeeting } from "@/server/plan/conflicts";
import { isActiveItem } from "@/server/plan/requirements";
import { PLAN_TIME_ZONE, weekdayByName, weekdayOf, zonedInstant } from "@/server/plan/time";

/**
 * The student's day (PLAN §3 Today timeline; lib/types/plan.ts DaySchedule): the class meetings on one
 * America/New_York date, from the student's items in the term in session that day which have a CRN, plus the
 * student-entered deadlines due that day.
 *
 * - The term: the Fall/Spring (else summer) term whose Banner dates contain the date; none → "no-term".
 * - Class days come from the Registrar calendar for that term: from the first "classes" row (classes begin) to
 *   the last one (classes end / last class day); outside them (orientation week, reading day, exams) there are no
 *   classes. Breaks ("break" rows) have none either; a break that starts at a time (Thanksgiving: Fri. Nov. 20 at
 *   4:20 p.m.) keeps the classes that start before it. "Classes Follow Monday Schedule" days use that weekday's
 *   meetings. Terms without calendar rows fall back to their Banner dates.
 * - Meetings: every non-TBA meeting (second meeting times and labs included) on the weekday, with ET wall times
 *   turned into instants for that date (DST-correct); sections with only TBA meetings are listed in `tba`.
 * - Cross-listed siblings are one class (listed once). Items that are dropped, failed or withdrawn are left out.
 * - `empty` says why there is nothing: no-term, break, weekend, no-sections (no item with a CRN in the term),
 *   no-classes-today.
 */

export interface DayScheduleResult extends DaySchedule {
  /** Student-entered deadlines due on this date (America/New_York). */
  deadlines: StudentDeadline[];
}

interface TermDay {
  termCode: TermCode | null;
  /** The weekday whose meetings run (a "Monday schedule" day), or null for no classes at all. */
  weekday: MeetingDay | null;
  reason: DaySchedule["empty"];
  /** On a break that starts at a time: classes starting before it still meet. */
  cutoff: string | null;
}

/** The term in session on `date` (regular terms first), from the resolver's Banner dates. */
export function termOnDate(terms: ResolvedTerms, date: string): TermCode | null {
  const containing = terms.terms
    .filter(
      (term) =>
        term.startDate !== undefined &&
        term.endDate !== undefined &&
        term.startDate <= date &&
        date <= term.endDate,
    )
    .sort(
      (a, b) =>
        Number(isRegularTerm(b.code)) - Number(isRegularTerm(a.code)) ||
        compareTerms(a.code, b.code),
    );
  return containing[0]?.code ?? null;
}

/** How classes run on `date` in `termCode` (see the module comment). Pure over the curated calendar. */
export function classDay(terms: ResolvedTerms, termCode: TermCode | null, date: string): TermDay {
  if (!termCode) return { termCode: null, weekday: null, reason: "no-term", cutoff: null };
  const rows = calendarForTerm(termCode);
  const classRows = rows.filter((row) => row.category === "classes");
  const info = terms.terms.find((term) => term.code === termCode);
  const first = classRows[0]?.start ?? info?.startDate ?? null;
  const last =
    classRows.length > 0 ? classRows[classRows.length - 1]!.start : (info?.endDate ?? null);
  const weekday = weekdayOf(date);
  if ((first && date < first) || (last && date > last)) {
    return { termCode, weekday: null, reason: "no-classes-today", cutoff: null };
  }
  let cutoff: string | null = null;
  for (const row of rows.filter((candidate) => candidate.category === "break")) {
    if (row.start <= date && date <= eventEndDay(row)) {
      if (row.start === date && row.time) {
        cutoff = row.time;
        continue;
      }
      return { termCode, weekday: null, reason: "break", cutoff: null };
    }
  }
  const override = classRows
    .filter((row) => row.start === date)
    .map((row) => /\b(monday|tuesday|wednesday|thursday|friday)\s+schedule\b/i.exec(row.title)?.[1])
    .find((name): name is string => name !== undefined);
  return {
    termCode,
    weekday: (override && weekdayByName(override)) || weekday,
    reason: null,
    cutoff,
  };
}

export interface DayScheduleInput {
  date: string;
  items: readonly PlanItem[];
  deadlines: readonly StudentDeadline[];
  terms: ResolvedTerms;
  /** Section lookup (default: the catalog). */
  section?: (termCode: TermCode, crn: string) => Promise<Section | null>;
}

export async function buildDaySchedule(input: DayScheduleInput): Promise<DayScheduleResult> {
  const { date, terms } = input;
  const deadlines = input.deadlines.filter(
    (deadline) => dayKey(deadline.dueAt, PLAN_TIME_ZONE) === date,
  );
  const termCode = termOnDate(terms, date);
  const day = classDay(terms, termCode, date);
  const base = { date, termCode, entries: [], tba: [], deadlines };
  if (day.reason === "no-term" || day.reason === "break") return { ...base, empty: day.reason };

  const withCrn = input.items.filter(
    (item) => item.termCode === termCode && item.crn && isActiveItem(item),
  );
  const lookup = input.section ?? lookupSection;
  const found: { item: PlanItem; section: Section }[] = [];
  for (const item of withCrn) {
    const section = await lookup(termCode!, item.crn!);
    if (!section) continue;
    if (found.some((other) => areSiblings(other.section, section))) continue;
    found.push({ item, section });
  }
  if (found.length === 0) {
    return {
      ...base,
      empty: day.weekday === "S" || day.weekday === "U" ? "weekend" : "no-sections",
    };
  }

  const tba = found
    .filter(({ section }) => !section.meetings.some(isTimedMeeting))
    .map(({ item, section }) => ({
      crn: section.crn,
      courseCode: item.courseCode,
      title: item.title,
    }));
  const entries: DayScheduleEntry[] = [];
  if (day.weekday) {
    for (const { item, section } of found) {
      for (const meeting of section.meetings) {
        if (!isTimedMeeting(meeting) || !meeting.days.includes(day.weekday)) continue;
        if (day.cutoff && meeting.start >= day.cutoff) continue;
        entries.push({
          crn: section.crn,
          courseCode: item.courseCode,
          title: item.title,
          kind: meeting.kind,
          start: meeting.start,
          end: meeting.end,
          startsAt: zonedInstant(date, meeting.start).toISOString(),
          endsAt: zonedInstant(date, meeting.end).toISOString(),
          ...(meeting.building ? { building: meeting.building } : {}),
          ...(meeting.room ? { room: meeting.room } : {}),
        });
      }
    }
  }
  entries.sort(
    (a, b) => a.start.localeCompare(b.start) || a.courseCode.localeCompare(b.courseCode),
  );
  let empty: DaySchedule["empty"] = null;
  if (entries.length === 0) {
    empty =
      day.reason === "no-classes-today"
        ? "no-classes-today"
        : day.weekday === "S" || day.weekday === "U"
          ? "weekend"
          : "no-classes-today";
  }
  return { ...base, entries, tba, empty };
}
