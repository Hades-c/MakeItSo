import "server-only";
import { formatTime } from "@/lib/format";
import type { SourceId } from "@/lib/sources";
import { termLabel, type ClassStanding, type TermCode } from "@/lib/term";
import type { CalendarEvent } from "@/lib/types/content";
import {
  ACADEMIC_CALENDAR,
  eventEndDay,
  type ContentDeadline,
} from "@/server/content/academic-calendar";
import { addDays } from "@/server/content/define";
import { zonedInstant } from "@/server/today/time";

/**
 * Today's reading of the Registrar's academic calendar (server/content/academic-calendar.ts): which break a day
 * falls in, the WebTree window behind Today's "WebTree is open … · Plan Spring 2027" line, and whether a row's
 * audience is the student. Pure over curated content.
 */

/** The break (category "break") covering `day`, e.g. "Fall Break"; null on a regular day. */
export function breakOn(day: string, calendar: readonly CalendarEvent[] = ACADEMIC_CALENDAR) {
  const row = calendar.find(
    (event) => event.category === "break" && event.start <= day && day <= eventEndDay(event),
  );
  return row ? { name: row.title, row } : null;
}

/**
 * Words that make an audience conditional: a qualifier the app cannot check (citizenship, plans, interests, aid,
 * "rising" years, graduation timing), so Today lists the row with its audience and never counts it as the
 * student's own. A colon, a semicolon or a parenthesis (other than "(Class of 2027)") does the same: those
 * audiences split by term or add conditions ("All students: first-years in spring; ...").
 */
const QUALIFIER =
  /[:;()]|\b(planning|plan|rising|with|who|citizens?|nationals?|residents?|applying|apply|interested|interest|interning|pursuing|preparing|exploring|considering|taking|receiving|seeking|eligible|eligibility|typically|preference|priority|graduating|graduates?|recent|if|except|not|standing|need|aid|enrolled in|first-generation|transfer|international|global|residential|leaders?|groups?|individual|varying)\b/i;

/** A part that names class years. "new" students are the first-years of their first fall (and incoming students). */
const YEAR_PART: readonly { pattern: RegExp; includes: (s: ClassStanding) => boolean }[] = [
  {
    pattern: /^(?:first[- ]years?|freshm[ae]n|new)$/,
    includes: (s) => s === "first-year" || s === "incoming",
  },
  { pattern: /^sophomores?$/, includes: (s) => s === "sophomore" },
  { pattern: /^juniors?$/, includes: (s) => s === "junior" },
  { pattern: /^seniors?$/, includes: (s) => s === "senior" },
  {
    pattern: /^non-seniors?$/,
    includes: (s) => s === "incoming" || s === "first-year" || s === "sophomore" || s === "junior",
  },
  {
    pattern: /^(?:continuing|returning)$/,
    includes: (s) => s === "first-year" || s === "sophomore" || s === "junior" || s === "senior",
  },
];

/** Parts that are not students at all ("Students, faculty and staff"): they neither include nor qualify. */
const NOT_STUDENTS =
  /^(?:alumni|faculty|staff|families|the public|the general public|departments?)$/;

/**
 * Whether a row's audience certainly includes the student. Conservative: anything it cannot be sure of is false,
 * so the row is listed with its audience ("For: ...") and never counted as the student's own.
 * - No audience → true.
 * - A conditional audience (QUALIFIER: "Students planning a January graduation", "Rising sophomores, ...",
 *   "Sophomores (U.S. citizens)", "All students: first-years in spring; ...") → false.
 * - Otherwise the audience is read as a list ("Sophomores, juniors, and seniors", "Students, faculty and staff"):
 *   true when one part is every student or names the student's class year ("Seniors (Class of 2027)").
 * An unknown standing (profile unavailable) is included only by an every-student audience.
 */
export function audienceIncludes(audience: string | null, standing: ClassStanding | null): boolean {
  if (audience === null || !audience.trim()) return true;
  const text = audience
    .toLowerCase()
    .replace(/\s*\(class of \d{4}\)/g, "")
    .replace(/ of all majors$/, "")
    .trim();
  if (QUALIFIER.test(text)) return false;
  const parts = text
    .split(/,|\band\b|\bor\b|\//)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/^(?:all|current|currently enrolled) /, "")
        .replace(/^davidson /, "")
        .replace(/ students?$/, "")
        .trim(),
    );
  let includes = false;
  for (const raw of parts) {
    // What is left of "All students", "Current students", "Davidson students": every student.
    if (raw === "" || raw === "students" || raw === "student") {
      includes = true;
      continue;
    }
    const part = raw;
    if (NOT_STUDENTS.test(part)) continue;
    const year = YEAR_PART.find((y) => y.pattern.test(part));
    if (!year) return false; // An unknown word: not sure who it is for.
    if (standing !== null && year.includes(standing)) includes = true;
  }
  return includes;
}

/**
 * The calendar category of a curated deadline ("deadline" or "registration" for a calendar row; null for an office
 * program's deadline): ContentDeadline.category, copied from the row it was made from.
 */
export function calendarCategoryOf(
  deadline: Pick<ContentDeadline, "kind" | "category">,
): CalendarEvent["category"] | null {
  return deadline.kind === "calendar" ? deadline.category : null;
}

export interface WebTreeWindow {
  termCode: TermCode;
  /** "Spring 2027". */
  termLabel: string;
  opensAt: Date;
  closesAt: Date;
  source: SourceId;
  url: string;
  verifiedAt: string;
}

/**
 * The WebTree preference window for the registration term, from the calendar's "WebTree Open: Submit <term> Course
 * Preferences" row (opening day and time) and its "WebTree Closes (<term> Preferences Due)" row (closing time; the
 * window's last day at midnight when there is none). Null outside [opens, closes) (PLAN §3: the "Plan <term>"
 * link is shown during the WebTree window only) or when the calendar has no window for that term.
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
  if (t >= closesAt.getTime() || t < opensAt.getTime()) return null;
  return {
    termCode: registrationTerm,
    termLabel: label,
    opensAt,
    closesAt,
    source: open.source,
    url: open.sources[0] ?? "",
    verifiedAt: open.verifiedAt,
  };
}

/** "WebTree is open for Spring 2027 course preferences until Tue, Nov 3 at 5:00 PM." in `timeZone`. */
export function webTreeWindowText(window: WebTreeWindow, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(window.closesAt);
  return `WebTree is open for ${window.termLabel} course preferences until ${day} at ${formatTime(window.closesAt, timeZone)}.`;
}
