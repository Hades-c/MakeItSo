import "server-only";

/**
 * Today service (PLAN §3 /today, §4.1.15 day summary; owner W7). Server components in app/(hub)/today call these
 * directly. Everything time-related is decided in America/New_York from server/clock.ts now().
 *
 *   load        per-request memoised loaders (profile, terms, plan, progress, day schedules, feeds) that degrade
 *               to { ok: false } instead of throwing
 *   summary     the deterministic day summary (lib/day-summary buildDaySummary) from the loaded parts
 *   agenda      one day of the timeline: classes, deadlines, campus events, the visible hours
 *   week        the five-day strip
 *   due-soon    calendar deadlines + registration windows + program deadlines + the student's own, merged
 *   degree      the compact degree map's terms × slots
 *   calendar    breaks, milestones ("WebTree opens"), the WebTree window behind "Plan <term>", audiences
 *   opportunities  curated office programs with upcoming deadlines, the Handshake entry point, quick links
 *   time        ET date helpers
 *
 * Today stores nothing of its own (no per-user collection), so it registers no account-data eraser.
 */

export * from "@/server/today/agenda";
export * from "@/server/today/calendar";
export * from "@/server/today/degree";
export * from "@/server/today/due-soon";
export * from "@/server/today/load";
export * from "@/server/today/opportunities";
export * from "@/server/today/summary";
export * from "@/server/today/time";
export * from "@/server/today/week";
