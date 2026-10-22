import type { WeekGridBlock } from "@/components/domain/week-grid";
import { clockLabel, parseClock } from "@/components/domain/time-geometry";
import { DAY_NAMES, joinDayNames, type WeekDay } from "@/components/domain/week-days";
import type { Meeting } from "@/lib/types/catalog";
import type { ScheduleConflict, WebTreeList } from "@/lib/types/plan";

/**
 * Meetings and conflicts for the Next semester tab (pure, isomorphic). The plan service decides conflicts
 * (server/plan detectConflicts: second meeting times included, TBA excluded, cross-listed siblings never
 * conflict); this module only turns them into a week grid and sentences.
 */

/** What the page needs of a section to draw and describe it. */
export interface SectionTimes {
  crn: string;
  courseCode: string;
  section: string;
  title: string;
  meetings: Meeting[];
}

/** "10:30" → "10:30a"; null for an unreadable time. */
export function clockText(value: string | null): string | null {
  const minutes = parseClock(value);
  return minutes === null ? null : clockLabel(minutes);
}

/** True when a meeting has no usable day or time ("Time TBA": not on the grid, not in conflicts). */
export function isTba(meeting: Meeting): boolean {
  return meeting.tba || meeting.days.length === 0 || meeting.start === null || meeting.end === null;
}

const KIND_WORDS: Readonly<Record<Meeting["kind"], string | null>> = {
  class: null,
  second: "second meeting",
  lab: "lab",
  other: null,
};

/** One meeting as text: "MWF 10:30a–11:20a · Chambers Building 2198", "Lab: T 1:30p–4:20p", "Time TBA". */
export function meetingText(meeting: Meeting): string {
  const kind = KIND_WORDS[meeting.kind];
  const prefix = kind ? `${kind.charAt(0).toUpperCase()}${kind.slice(1)}: ` : "";
  if (isTba(meeting)) return `${prefix}Time TBA`;
  const where = [meeting.building, meeting.room].filter(Boolean).join(" ");
  const when = `${meeting.days.join("")} ${clockText(meeting.start)}–${clockText(meeting.end)}`;
  return `${prefix}${when}${where ? ` · ${where}` : ""}`;
}

/** Every meeting of a section as text; "Time TBA" when it has none. */
export function meetingsText(meetings: readonly Meeting[]): string[] {
  return meetings.length === 0 ? ["Time TBA"] : meetings.map(meetingText);
}

/** CRNs that take part in at least one conflict. */
export function conflictingCrns(conflicts: readonly ScheduleConflict[]): Set<string> {
  return new Set(conflicts.flatMap((conflict) => [conflict.a.crn, conflict.b.crn]));
}

/**
 * Week grid blocks for the first choices (what the week looks like when every first choice comes through). An
 * alternate is either/or with its choice, so alternates stay off the grid; their conflicts are in the report.
 * A block is flagged as a conflict only when the plan service reported one between two first choices.
 */
export function weekBlocks(
  list: WebTreeList,
  sections: Readonly<Record<string, SectionTimes>>,
  conflicts: readonly ScheduleConflict[],
): WeekGridBlock[] {
  const choiceCrns = new Set(list.choices.map((choice) => choice.crn));
  const clashing = conflictingCrns(
    conflicts.filter((c) => choiceCrns.has(c.a.crn) && choiceCrns.has(c.b.crn)),
  );
  const blocks: WeekGridBlock[] = [];
  for (const choice of [...list.choices].sort((a, b) => a.rank - b.rank)) {
    const section = sections[choice.crn];
    if (!section) continue;
    const code = `${section.courseCode} ${section.section}`;
    const timed = section.meetings.filter((meeting) => !isTba(meeting));
    if (timed.length === 0) {
      blocks.push({ id: `${section.crn}-tba`, code, title: section.title, tba: true });
      continue;
    }
    timed.forEach((meeting, index) => {
      for (const day of meeting.days) {
        blocks.push({
          id: `${section.crn}-${index}-${day}`,
          code,
          title: section.title,
          day: day as WeekDay,
          start: meeting.start ?? undefined,
          end: meeting.end ?? undefined,
          room: [meeting.building, meeting.room].filter(Boolean).join(" ") || undefined,
          conflict: clashing.has(section.crn),
        });
      }
    });
  }
  return blocks;
}

/** First and last whole hour the grid shows: 8a–5p at least, widened to fit every timed block. */
export function gridHours(blocks: readonly WeekGridBlock[]): {
  startHour: number;
  endHour: number;
} {
  let start = 8;
  let end = 17;
  for (const block of blocks) {
    const s = parseClock(block.start);
    const e = parseClock(block.end);
    if (s !== null) start = Math.min(start, Math.floor(s / 60));
    if (e !== null) end = Math.max(end, Math.ceil(e / 60));
  }
  return { startHour: Math.max(0, start), endHour: Math.min(24, end) };
}

export interface ConflictLine {
  key: string;
  text: string;
  /** Both sides are first choices (the week as ranked does not work), not just an alternate. */
  betweenChoices: boolean;
}

/**
 * One sentence per conflicting pair, with the days and times merged: "Choice 1 CSC 221 A and choice 2 SPA 201 B
 * meet at the same time on Mon, Wed, Fri (10:30a–11:20a)." Alternates are named as such ("alternate for
 * choice 1").
 */
export function conflictLines(
  list: WebTreeList,
  sections: Readonly<Record<string, SectionTimes>>,
  conflicts: readonly ScheduleConflict[],
): ConflictLine[] {
  const role = new Map<string, string>();
  const isChoice = new Set<string>();
  for (const choice of list.choices) {
    role.set(choice.crn, `choice ${choice.rank}`);
    isChoice.add(choice.crn);
    for (const crn of choice.alternates) role.set(crn, `alternate for choice ${choice.rank}`);
  }
  const name = (side: ScheduleConflict["a"]) => {
    const section = sections[side.crn];
    const code = section ? `${section.courseCode} ${section.section}` : side.courseCode;
    const who = role.get(side.crn);
    return who ? `${who.charAt(0).toUpperCase()}${who.slice(1)}, ${code} (CRN ${side.crn})` : code;
  };
  const pairs = new Map<
    string,
    { a: ScheduleConflict["a"]; b: ScheduleConflict["b"]; days: Set<WeekDay>; spans: Set<string> }
  >();
  for (const conflict of conflicts) {
    const key = [conflict.a.crn, conflict.b.crn].sort().join("|");
    const entry = pairs.get(key) ?? {
      a: conflict.a,
      b: conflict.b,
      days: new Set<WeekDay>(),
      spans: new Set<string>(),
    };
    entry.days.add(conflict.day as WeekDay);
    entry.spans.add(`${clockText(conflict.start)}–${clockText(conflict.end)}`);
    pairs.set(key, entry);
  }
  return [...pairs.entries()].map(([key, pair]) => {
    const when = pair.spans.size === 1 ? ` (${[...pair.spans][0]})` : "";
    const days = joinDayNames(pair.days);
    return {
      key,
      text: `${name(pair.a)} and ${lowerFirst(name(pair.b))} meet at the same time on ${days}${when}.`,
      betweenChoices: isChoice.has(pair.a.crn) && isChoice.has(pair.b.crn),
    };
  });
}

function lowerFirst(text: string): string {
  return /^(Choice|Alternate)\b/.test(text)
    ? `${text.charAt(0).toLowerCase()}${text.slice(1)}`
    : text;
}

/** "Monday" for a day letter (screen-reader text). */
export function dayName(day: WeekDay): string {
  return DAY_NAMES[day].long;
}
