import "server-only";
import { readEnv } from "@/server/env";

/**
 * "Now" for server code (PLAN §5 "Dates/times"). Services, route handlers and server components that decide
 * anything by date (the current and registration term, Today, Due soon, the day summary, "verified <date>" ages)
 * call `now()` instead of `new Date()`.
 *
 * In EXTERNAL_MODE=fixtures with FIXTURES_NOW set (vitest and Playwright pin 2026-09-30T12:00:00-04:00, the day
 * the fixtures were recorded), it returns that instant, so fixtures-backed tests and the e2e server keep resolving
 * the same terms after the real calendar moves on (e.g. registration becomes 202701 on 2027-01-19, a term the
 * fixtures do not have). Elsewhere it is the real clock. Pure lib code takes `now` as a parameter instead.
 *
 * To test another instant: `vi.stubEnv("FIXTURES_NOW", "2027-02-01T09:00:00-05:00")`. vi.setSystemTime does
 * not move `now()` while FIXTURES_NOW is set.
 */
export function now(): Date {
  if (readEnv("EXTERNAL_MODE") === "fixtures") {
    const pinned = readEnv("FIXTURES_NOW");
    if (pinned) return new Date(pinned);
  }
  return new Date();
}
