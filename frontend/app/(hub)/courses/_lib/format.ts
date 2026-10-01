import { clockLabel, parseClock } from "@/components/domain/time-geometry";
import { DAY_NAMES, sortDays } from "@/components/domain/week-days";
import { termLabel, type TermCode } from "@/lib/term";
import type { Availability, Instructor, Meeting, Section } from "@/lib/types/catalog";

/**
 * Display text for the course pages (PLAN §5 "Sections", "Availability"). Pure and isomorphic: the server
 * components and the client islands share it, and tests/w8/format.test.ts pins every rule.
 */

/** "MWF" (compact, mono rows) from meeting days in calendar order. */
export function compactDays(days: readonly Meeting["days"][number][]): string {
  return sortDays(days).join("");
}

/** "Mon · Wed · Fri" (the index card). */
export function longDays(days: readonly Meeting["days"][number][]): string {
  return sortDays(days)
    .map((day) => DAY_NAMES[day].short)
    .join(" · ");
}

/** "10:30a–11:20a" for a meeting; null for a TBA meeting (no days or no start). */
export function meetingTime(
  meeting: Pick<Meeting, "start" | "end" | "tba" | "days">,
): string | null {
  if (meeting.tba || meeting.days.length === 0) return null;
  const start = parseClock(meeting.start);
  if (start === null) return null;
  const end = parseClock(meeting.end);
  return end === null ? clockLabel(start) : `${clockLabel(start)}–${clockLabel(end)}`;
}

const KIND_LABEL: Record<Meeting["kind"], string | null> = {
  class: null,
  second: "Second meeting",
  lab: "Lab",
  other: null,
};

/** "MWF 10:30a–11:20a", "Lab · T 1:30p–4:20p", or "Time TBA" (PLAN §5: TBA meetings say so). */
export function meetingText(meeting: Meeting, style: "compact" | "long" = "compact"): string {
  const time = meetingTime(meeting);
  const kind = KIND_LABEL[meeting.kind];
  if (!time) return kind ? `${kind} · Time TBA` : "Time TBA";
  const days = style === "compact" ? compactDays(meeting.days) : longDays(meeting.days);
  return `${kind ? `${kind} · ` : ""}${days} ${time}`;
}

const KIND_ORDER: Record<Meeting["kind"], number> = { class: 0, second: 1, lab: 2, other: 3 };

/** Meetings with the class meeting first, then second meeting times, labs and others (stable otherwise). */
export function orderedMeetings<T extends Pick<Meeting, "kind">>(meetings: readonly T[]): T[] {
  return [...meetings].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/** Every meeting of a section ("Time TBA" when it has none). */
export function sectionTimes(section: Pick<Section, "meetings">): string[] {
  if (section.meetings.length === 0) return ["Time TBA"];
  return orderedMeetings(section.meetings).map((meeting) => meetingText(meeting));
}

/** "Watson 132" from a meeting's building and room; null when neither is known. */
export function meetingRoom(meeting: Pick<Meeting, "building" | "room">): string | null {
  const text = [meeting.building, meeting.room].filter(Boolean).join(" ").trim();
  return text || null;
}

/** "Dan Aldridge", "Staff (TBA)" for the Staff placeholder (PLAN §5). */
export function instructorName(instructor: Instructor): string {
  if (instructor.isStaff) return "Staff (TBA)";
  const name = `${instructor.first} ${instructor.last}`.replace(/\s+/g, " ").trim();
  return name || "Staff (TBA)";
}

/** "1 credit", "0 credits", "0–1 credits" (credits are per section; 1 per course at Davidson). */
export function creditsLabel(credits: readonly number[]): string {
  const values = [...new Set(credits)].sort((a, b) => a - b);
  if (values.length === 0) return "Credits not listed";
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));
  if (values.length === 1) {
    const only = values[0]!;
    return `${fmt(only)} ${only === 1 ? "course credit" : "course credits"}`;
  }
  return `${fmt(values[0]!)}–${fmt(values[values.length - 1]!)} course credits`;
}

/** "9 seats open", "1 seat open", "Full" (summed over registrable sections; never negative). */
export function openSeatsLabel(openSeats: number): string {
  if (openSeats <= 0) return "No open seats";
  return openSeats === 1 ? "1 seat open" : `${openSeats} seats open`;
}

/** "1 section", "3 sections". */
export function sectionsLabel(n: number): string {
  return n === 1 ? "1 section" : `${n} sections`;
}

const YEAR_WORDS = ["First-years", "Sophomores", "Juniors", "Seniors"] as const;

/** [1, 2] → "First-years and sophomores only"; [2, 3, 4] → "Sophomores, juniors and seniors only". */
export function eligibleYearsText(years: readonly number[]): string {
  const words = [...new Set(years)]
    .sort((a, b) => a - b)
    .map((year) => YEAR_WORDS[year - 1])
    .filter((word): word is (typeof YEAR_WORDS)[number] => word !== undefined)
    .map((word, i) => (i === 0 ? word : word.toLowerCase()));
  if (words.length === 0) return "Some class years only";
  const list =
    words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} and ${words.at(-1)!}`;
  return `${list} only`;
}

/** Restriction flags of a section, as short labels (they flag, never block: PLAN §5). */
export function restrictionFlags(section: Pick<Section, "restrictions">): string[] {
  const out: string[] = [];
  const { eligibleYears, untilFirstDay, permissionRequired, notIfCompMet } = section.restrictions;
  if (eligibleYears && eligibleYears.length > 0) {
    out.push(
      `${eligibleYearsText(eligibleYears)}${untilFirstDay ? " until the first day of class" : ""}`,
    );
  }
  if (permissionRequired) out.push("Instructor permission required");
  if (notIfCompMet) out.push("Closed if you have met the writing requirement");
  return out;
}

/** "Fall 2024, Fall 2025 and Fall 2026". */
export function joinTermLabels(codes: readonly TermCode[]): string {
  const labels = codes.map(termLabel);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)!}`;
}

/** "Usually offered in Fall (based on Fall 2024 and Fall 2025)" for an unpublished term; null without a claim. */
export function usuallyOfferedText(entry: Availability): string | null {
  if (entry.status !== "not-yet-published" || !entry.usually) return null;
  const basis =
    entry.usually.basedOn.length > 0 ? ` (based on ${joinTermLabels(entry.usually.basedOn)})` : "";
  return `Usually offered in ${entry.usually.season}${basis}`;
}

/**
 * One availability line (PLAN §5): "Offered · 2 sections", "Not offered", "Not yet published". Never a bare
 * "Offered" for an unpublished term.
 */
export function availabilityText(entry: Availability): string {
  switch (entry.status) {
    case "offered":
      return entry.sectionCount !== undefined
        ? `Offered · ${sectionsLabel(entry.sectionCount)}`
        : "Offered";
    case "not-offered":
      return "Not offered";
    case "not-yet-published":
      return "Not yet published";
  }
}

/** "CSC 221 A" for a section. */
export function sectionLabel(section: Pick<Section, "courseCode" | "section">): string {
  return `${section.courseCode} ${section.section}`;
}

/** A course's subject from its code ("CSC 221" → "CSC"). */
export function subjectOf(code: string): string {
  return code.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
}

/** Primary sections of a course: labs ("L", "L1") only when there is nothing else. */
export function primarySections<T extends Pick<Section, "section">>(sections: readonly T[]): T[] {
  const primary = sections.filter((section) => !/^L\d{0,2}$/.test(section.section));
  return primary.length > 0 ? primary : [...sections];
}
