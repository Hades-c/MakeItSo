import "server-only";
import {
  calendarDeadlinesBetween,
  type CalendarQueryOptions,
  type ContentDeadline,
} from "@/server/content/academic-calendar";
import type { DayInput } from "@/server/content/define";
import { programDeadlinesBetween } from "@/server/content/offices";

export type { ContentDeadline } from "@/server/content/academic-calendar";

/**
 * Curated deadlines for Today's "Due soon" (PLAN §3): the academic calendar's deadlines and registration windows
 * (REGISTRAR / DAVIDSON OFFICES) plus the office programs' pinned deadlines (MATTHEWS CENTER, HURT HUB PROGRAMS,
 * DAVIDSON OFFICES), on the Davidson days `from`..`to` inclusive. Windows already under way are included while
 * they last. Student-entered deadlines come from the plan service and are merged by Today.
 *
 * Sorted by date; on one day, untimed (all-day) items first, then by time, then calendar rows before programs,
 * then by title.
 */
export function deadlinesBetween(
  from: DayInput,
  to: DayInput,
  options: Pick<CalendarQueryOptions, "audience"> = {},
): ContentDeadline[] {
  return [
    ...calendarDeadlinesBetween(from, to, options),
    ...programDeadlinesBetween(from, to),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      (a.kind === b.kind ? 0 : a.kind === "calendar" ? -1 : 1) ||
      a.title.localeCompare(b.title),
  );
}
