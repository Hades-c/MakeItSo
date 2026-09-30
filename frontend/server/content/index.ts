import "server-only";
import type { SourceId } from "@/lib/sources";
import { ACADEMIC_CALENDAR, calendarEventSource } from "@/server/content/academic-calendar";
import { latestVerifiedAt } from "@/server/content/define";
import { PROGRAMS } from "@/server/content/offices";
import { REQUIREMENTS_VERIFIED_AT } from "@/server/content/requirements";

/**
 * Curated content (PLAN §6.1 W4b): typed, sourced, validated at load, frozen, and never fetched. Import the
 * module you need (`@/server/content/careers`) or this barrel.
 *
 *   academic-calendar  Registrar 2026-27 calendar + Today/Due soon queries
 *   requirements       official requirement codes and graduation rules by catalog year (W5's engine reads these)
 *   careers            the 24 career paths
 *   alumni             verified alumni (PLAN §1 rules applied; verified @davidson.edu viewers only)
 *   offices            offices and their programs (amounts/deadlines as published)
 *   links              portal link-outs and the Handshake entry point
 *   deadlines          calendar + program deadlines merged for Due soon
 */

export * from "@/server/content/academic-calendar";
export * from "@/server/content/alumni";
export * from "@/server/content/careers";
export { deadlinesBetween } from "@/server/content/deadlines";
export { addDays, davidsonDay, type DayInput } from "@/server/content/define";
export * from "@/server/content/links";
export * from "@/server/content/offices";
export * from "@/server/content/requirements";

/** The curated sources the Sources panel lists with "verified <date>". */
export type CuratedSourceId = Extract<
  SourceId,
  "registrar" | "matthews-center" | "hurt-hub-programs" | "davidson-offices"
>;

/**
 * When each curated source's content was last checked: REGISTRAR = the calendar's Registrar rows and the
 * graduation rules; the office tags = their programs (and, for DAVIDSON OFFICES, other offices' calendar rows).
 * Null when no content carries the tag.
 */
export function curatedSourceVerifiedAt(source: CuratedSourceId): string | null {
  const dates = [
    ...ACADEMIC_CALENDAR.filter((event) => calendarEventSource(event) === source),
    ...PROGRAMS.filter((program) => program.source === source),
    ...(source === "registrar" ? [{ verifiedAt: REQUIREMENTS_VERIFIED_AT }] : []),
  ];
  return dates.length > 0 ? latestVerifiedAt(dates) : null;
}
