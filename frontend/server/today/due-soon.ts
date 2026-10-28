import "server-only";
import { formatShortDate } from "@/lib/format";
import type { SourceId } from "@/lib/sources";
import type { ClassStanding } from "@/lib/term";
import type { StudentDeadline } from "@/lib/types/plan";
import { clockLabel } from "@/components/domain/time-geometry";
import type { ContentDeadline } from "@/server/content/academic-calendar";
import { getOffice, officeShortName } from "@/server/content/offices";
import { audienceIncludes, calendarCategoryOf } from "@/server/today/calendar";
import { addDaysToKey, etClock, etDay, zonedInstant } from "@/server/today/time";

/**
 * Today's "Due soon" (PLAN §3): the academic calendar's deadlines and registration windows (REGISTRAR, DAVIDSON
 * OFFICES), the curated office programs' deadlines (MATTHEWS CENTER, HURT HUB PROGRAMS, ...; server/content
 * deadlinesBetween) and the student's own deadlines (YOUR PLAN; the ones imported from their Moodle calendar are
 * MOODLE, "course-site"), merged over the next DUE_SOON_DAYS Davidson days. Each item keeps its stored source for
 * its source note (PLAN §5 Sources). Pure.
 *
 * - A window already under way (WebTree Oct 12 - Nov 3) stays while it lasts, sorted as of today.
 * - A deadline with a published time that has passed is gone; an all-day one stays for its whole day.
 * - `forYou` is false when the row names other class years or a conditional audience: listed with the audience
 *   under "Also in the next two weeks", never counted as due for the student (the header, the card's count and
 *   the day summary count only `forYou` items), and never drawn in the urgent red.
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
  /**
   * The office a DAVIDSON OFFICES program deadline is from, as its source note names it ("Office of
   * Fellowships", officeShortName); null for every other row.
   */
  office: string | null;
  /** A student deadline read from a syllabus (/syllabi): AI-extracted, so its row shows the AI chip. */
  fromSyllabus: boolean;
  url: string | null;
  verifiedAt: string | null;
}

/**
 * The source a student deadline is shown with: the student's own (YOUR PLAN), whether typed in or read from their
 * syllabus, or the course site it was imported from (by its `origin`). An origin not listed here is the student's.
 */
const ORIGIN_SOURCES: Readonly<Record<string, SourceId>> = { moodle: "course-site" };

export function studentDeadlineSource(deadline: Pick<StudentDeadline, "origin">): SourceId {
  return ORIGIN_SOURCES[deadline.origin ?? "manual"] ?? "my-plan";
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

function officeOf(deadline: ContentDeadline): string | null {
  if (deadline.source !== "davidson-offices" || !deadline.officeSlug) return null;
  const office = getOffice(deadline.officeSlug);
  return office ? officeShortName(office) : null;
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
    office: officeOf(deadline),
    fromSyllabus: false,
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
    source: studentDeadlineSource(deadline),
    office: null,
    fromSyllabus: deadline.origin === "syllabus",
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
 * How many rows are due for the student: their own deadlines and the calendar and program rows whose audience
 * certainly includes them (`forYou`). The header's "N due for you in the next two weeks" and the card's count
 * both use it, and it is exactly the number of rows listed under the card's heading (groupDueSoon `forYou`).
 */
export function dueForYouCount(items: readonly DueSoonItem[]): number {
  return items.filter((item) => item.forYou).length;
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
 * The card's groups. `forYou`: every row for the student, in date order, never held back (the count says how many
 * there are). `also`: the other rows ("Also in the next two weeks": other class years, conditional audiences), in
 * date order, as many as fit in `max` rows after the student's. `more`: the rest of those, one press away ("Show N
 * more"). Nothing is dropped: the three groups together are `items`.
 */
export interface DueSoonGroups {
  forYou: DueSoonItem[];
  also: DueSoonItem[];
  more: DueSoonItem[];
}

export function groupDueSoon(items: readonly DueSoonItem[], max: number): DueSoonGroups {
  const forYou = items.filter((item) => item.forYou);
  const others = items.filter((item) => !item.forYou);
  const room = Math.max(0, max - forYou.length);
  return { forYou, also: others.slice(0, room), more: others.slice(room) };
}

/**
 * The rows Due soon shows before "Show N more", in the order they are listed: the student's rows first, then the
 * others by date (groupDueSoon `forYou` then `also`).
 */
export function pickShown(items: readonly DueSoonItem[], max: number): DueSoonItem[] {
  const { forYou, also } = groupDueSoon(items, max);
  return [...forYou, ...also];
}
