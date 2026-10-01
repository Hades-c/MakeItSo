import "server-only";
import { formatShortDate } from "@/lib/format";
import type { SourceId } from "@/lib/sources";
import type { ClassStanding } from "@/lib/term";
import type { StudentDeadline } from "@/lib/types/plan";
import { clockLabel } from "@/components/domain/time-geometry";
import type { ContentDeadline } from "@/server/content/academic-calendar";
import { audienceIncludes, calendarCategoryOf } from "@/server/today/calendar";
import { addDaysToKey, etClock, etDay, zonedInstant } from "@/server/today/time";

/**
 * Today's "Due soon" (PLAN §3): the academic calendar's deadlines and registration windows (REGISTRAR, DAVIDSON
 * OFFICES), the curated office programs' deadlines (MATTHEWS CENTER, HURT HUB PROGRAMS, ...; server/content
 * deadlinesBetween) and the student's own deadlines (YOUR PLAN), merged over the next DUE_SOON_DAYS Davidson
 * days. Each item keeps its stored source for its tag (PLAN §5 Sources). Pure.
 *
 * - A window already under way (WebTree Oct 12 - Nov 3) stays while it lasts, sorted as of today.
 * - A deadline with a published time that has passed is gone; an all-day one stays for its whole day.
 * - `forYou` is false when the row names other class years or a conditional audience: listed with the audience,
 *   never counted as the student's own (the day summary counts only `forYou` items).
 */

export const DUE_SOON_DAYS = 14;

/**
 * deadline: a calendar row of category "deadline" due on one day; window: a multi-day deadline row; registration:
 * a calendar registration row (WebTree, Banner add/drop, schedules available), an opening or a window, never a
 * deadline; program: an office program's deadline (optional applications); student: the student's own.
 */
export type DueSoonKind = "deadline" | "window" | "registration" | "program" | "student";

export interface DueSoonItem {
  id: string;
  kind: DueSoonKind;
  title: string;
  /** A program deadline's label ("Priority deadline"). */
  label: string | null;
  audience: string | null;
  forYou: boolean;
  /** First day (Davidson date). */
  day: string;
  /** Last day of a window, else null. */
  endDay: string | null;
  /** Published 24 h ET time, else null (all day). */
  time: string | null;
  /** The instant it is due (timed items), else null. */
  dueAt: string | null;
  /** The window started before today. */
  ongoing: boolean;
  courseCode: string | null;
  source: SourceId;
  url: string | null;
  verifiedAt: string | null;
}

export interface DueSoonInput {
  now: Date;
  standing: ClassStanding | null;
  contentDeadlines: readonly ContentDeadline[];
  studentDeadlines: readonly StudentDeadline[];
}

/** First and last Davidson day of the Due soon window. */
export function dueSoonRange(now: Date): { from: string; to: string } {
  const from = etDay(now);
  return { from, to: addDaysToKey(from, DUE_SOON_DAYS - 1) };
}

function fromContent(deadline: ContentDeadline, today: string, standing: ClassStanding | null) {
  const kind: DueSoonKind =
    deadline.kind === "program"
      ? "program"
      : calendarCategoryOf(deadline) === "registration"
        ? "registration"
        : deadline.endDate
          ? "window"
          : "deadline";
  const timedInstant =
    deadline.time && !deadline.endDate ? zonedInstant(deadline.date, deadline.time) : null;
  return {
    id: deadline.id,
    kind,
    title: deadline.title,
    label: deadline.label,
    audience: deadline.audience,
    forYou: audienceIncludes(deadline.audience, standing),
    day: deadline.date,
    endDay: deadline.endDate,
    time: deadline.time,
    dueAt: timedInstant ? timedInstant.toISOString() : null,
    ongoing: deadline.date < today,
    courseCode: null,
    source: deadline.source,
    url: deadline.url,
    verifiedAt: deadline.verifiedAt,
  } satisfies DueSoonItem;
}

function fromStudent(deadline: StudentDeadline): DueSoonItem {
  return {
    id: `student:${deadline.id}`,
    kind: "student",
    title: deadline.title,
    label: null,
    audience: null,
    forYou: true,
    day: etDay(deadline.dueAt),
    endDay: null,
    time: etClock(deadline.dueAt),
    dueAt: new Date(deadline.dueAt).toISOString(),
    ongoing: false,
    courseCode: deadline.courseCode ?? null,
    source: "my-plan",
    url: null,
    verifiedAt: null,
  };
}

const KIND_ORDER: Record<DueSoonKind, number> = {
  registration: 0,
  window: 1,
  deadline: 2,
  program: 3,
  student: 4,
};

/**
 * The deadlines among Due soon items that are the student's to meet (the header's "N deadlines in the next two
 * weeks"): the calendar's one-day deadline rows for their class year and their own. Registration openings and
 * windows, multi-day rows and optional program applications are listed, never counted as deadlines.
 */
export function ownDeadlineCount(items: readonly DueSoonItem[]): number {
  return items.filter(
    (item) => item.forYou && (item.kind === "deadline" || item.kind === "student"),
  ).length;
}

export function buildDueSoon(input: DueSoonInput): DueSoonItem[] {
  const { from, to } = dueSoonRange(input.now);
  const t = input.now.getTime();
  const items = [
    ...input.contentDeadlines
      .filter((deadline) => (deadline.endDate ?? deadline.date) >= from && deadline.date <= to)
      .map((deadline) => fromContent(deadline, from, input.standing)),
    ...input.studentDeadlines.map(fromStudent).filter((item) => item.day <= to),
  ].filter((item) => item.dueAt === null || Date.parse(item.dueAt) >= t);
  const sortDay = (item: DueSoonItem) => (item.ongoing ? from : item.day);
  return items.sort(
    (a, b) =>
      sortDay(a).localeCompare(sortDay(b)) ||
      (a.time ?? "").localeCompare(b.time ?? "") ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
}

/** "Sep 30" for a Davidson date (no zone shift: the key already is the Davidson day). */
function shortDay(day: string): string {
  return formatShortDate(new Date(`${day}T12:00:00Z`), "UTC");
}

function weekdayShort(day: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

function clockOf(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return clockLabel((h ?? 0) * 60 + (m ?? 0));
}

/**
 * When an item is due, in the Registrar-ledger style of the mockup: "Today 5:00p", "Tomorrow", "Thu 11:59p",
 * "Mon Oct 12" (a week or more out), "Oct 12 – Nov 3" (a window ahead), "Until Nov 3" (a window under way).
 */
export function dueLabel(item: DueSoonItem, now: Date): string {
  const today = etDay(now);
  if (item.endDay && item.day <= today) return `Until ${shortDay(item.endDay)}`;
  if (item.endDay) return `${shortDay(item.day)} – ${shortDay(item.endDay)}`;
  const time = item.time ? ` ${clockOf(item.time)}` : "";
  if (item.day === today) return `Today${time}`;
  if (item.day === addDaysToKey(today, 1)) return `Tomorrow${time}`;
  if (item.day < addDaysToKey(today, 7)) return `${weekdayShort(item.day)}${time}`;
  return `${weekdayShort(item.day)} ${shortDay(item.day)}${time}`;
}

/**
 * The rows Due soon shows when there are more than `max`: the academic calendar's and the student's own first
 * (registration windows and Registrar deadlines must never be pushed out by office programs), then the programs
 * in date order; the result keeps the list's date order.
 */
export function pickShown(items: readonly DueSoonItem[], max: number): DueSoonItem[] {
  if (items.length <= max) return [...items];
  const keep = new Set(
    [
      ...items.filter((item) => item.kind !== "program"),
      ...items.filter((item) => item.kind === "program"),
    ]
      .slice(0, max)
      .map((item) => item.id),
  );
  return items.filter((item) => keep.has(item.id));
}
