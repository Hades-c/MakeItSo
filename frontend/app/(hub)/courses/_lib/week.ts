import type { WeekGridBlock } from "@/components/domain/week-grid";
import { parseClock } from "@/components/domain/time-geometry";
import type { Section } from "@/lib/types/catalog";
import type { ScheduleConflict } from "@/lib/types/plan";
import { meetingRoom, sectionLabel } from "./format";

/**
 * The course page's week grid (PLAN §3 "week-grid conflict check vs plan"): the student's chosen sections for the
 * term plus the section being looked at, drawn dashed (tentative) unless it is already the planned one, with every
 * block of a conflicting pair marked. Pure: the server passes the sections and detectConflicts()'s answer.
 */

export interface WeekInput {
  /** Sections chosen in the plan for this term (other courses, and this course when planned). */
  planned: readonly Section[];
  /** The section being looked at; null when the course has none in this term. */
  chosen: Section | null;
  /** detectConflicts over planned + chosen. */
  conflicts: readonly ScheduleConflict[];
}

export interface WeekView {
  blocks: WeekGridBlock[];
  startHour: number;
  endHour: number;
  /** The chosen section is not in the plan yet (drawn dashed). */
  chosenTentative: boolean;
  /** Conflicts that involve the chosen section. */
  chosenConflicts: ScheduleConflict[];
}

/** Conflict windows per "crn|day" (minutes since midnight). */
type ConflictWindows = Map<string, { start: number; end: number }[]>;

/** A meeting is marked only when one of its CRN's conflict windows that day overlaps its own time. */
function overlapsConflict(
  windows: ConflictWindows,
  crn: string,
  day: string,
  start: string,
  end: string,
): boolean {
  const s = parseClock(start);
  const e = parseClock(end);
  if (s === null || e === null) return false;
  return (windows.get(`${crn}|${day}`) ?? []).some((w) => w.start < e && s < w.end);
}

function blocksOf(section: Section, flags: { tentative: boolean; conflict: ConflictWindows }) {
  const out: WeekGridBlock[] = [];
  const label = sectionLabel(section);
  section.meetings.forEach((meeting, index) => {
    const room = meetingRoom(meeting) ?? undefined;
    if (meeting.tba || meeting.days.length === 0 || !meeting.start || !meeting.end) {
      out.push({
        id: `${section.crn}-${index}-tba`,
        code: label,
        title: section.title,
        tba: true,
        tentative: flags.tentative,
      });
      return;
    }
    for (const day of meeting.days) {
      out.push({
        id: `${section.crn}-${index}-${day}-${meeting.start}`,
        code: label,
        title: section.title,
        day,
        start: meeting.start,
        end: meeting.end,
        ...(room ? { room } : {}),
        tentative: flags.tentative,
        conflict: overlapsConflict(flags.conflict, section.crn, day, meeting.start, meeting.end),
      });
    }
  });
  if (section.meetings.length === 0) {
    out.push({
      id: `${section.crn}-tba`,
      code: label,
      title: section.title,
      tba: true,
      tentative: flags.tentative,
    });
  }
  return out;
}

/** Whole hours that hold every timed block, at least 9a–4p (the mockup's window), at most 7a–10p. */
export function hoursFor(blocks: readonly WeekGridBlock[]): { startHour: number; endHour: number } {
  let start = 9 * 60;
  let end = 16 * 60;
  for (const block of blocks) {
    const s = parseClock(block.start);
    const e = parseClock(block.end);
    if (s === null || e === null) continue;
    start = Math.min(start, s);
    end = Math.max(end, e);
  }
  return {
    startHour: Math.max(7, Math.floor(start / 60)),
    endHour: Math.min(22, Math.max(Math.ceil(end / 60), Math.floor(start / 60) + 1)),
  };
}

export function weekView({ planned, chosen, conflicts }: WeekInput): WeekView {
  const marked: ConflictWindows = new Map();
  for (const conflict of conflicts) {
    const start = parseClock(conflict.start);
    const end = parseClock(conflict.end);
    if (start === null || end === null) continue;
    for (const crn of [conflict.a.crn, conflict.b.crn]) {
      const key = `${crn}|${conflict.day}`;
      marked.set(key, [...(marked.get(key) ?? []), { start, end }]);
    }
  }
  const plannedCrns = new Set(planned.map((section) => section.crn));
  const chosenTentative = chosen !== null && !plannedCrns.has(chosen.crn);
  const blocks: WeekGridBlock[] = [];
  for (const section of planned) {
    blocks.push(...blocksOf(section, { tentative: false, conflict: marked }));
  }
  if (chosen && chosenTentative) {
    blocks.push(...blocksOf(chosen, { tentative: true, conflict: marked }));
  }
  const chosenConflicts = chosen
    ? conflicts.filter((c) => c.a.crn === chosen.crn || c.b.crn === chosen.crn)
    : [];
  return { blocks, ...hoursFor(blocks), chosenTentative, chosenConflicts };
}
