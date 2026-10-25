import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TermScheduleEntry } from "@/lib/term";
import type { TermClock } from "@/server/plan/status-rules";

/**
 * The real Davidson terms list (tests/fixtures/external/course-schedule/terms.json, fetched 2026-09-30) as the
 * term resolvers read it. Summer 2026 runs 2026-05-19 to 2026-08-14, Fall 2026 2026-08-24 to 2026-12-15, Spring
 * 2027 2027-01-19 to 2027-05-12 and Fall 2027 from 2027-08-23.
 */
export const FIXTURE_TERMS: readonly TermScheduleEntry[] = (
  JSON.parse(
    readFileSync(
      // A path, not a URL object: jsdom test files have their own URL class.
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../fixtures/external/course-schedule/terms.json",
      ),
      "utf8",
    ),
  ) as {
    term_code: string;
    is_active: boolean;
    is_summer: boolean;
    start_date: number | null;
    end_date: number | null;
  }[]
).map((t) => ({
  code: t.term_code,
  isSummer: t.is_summer,
  isActive: t.is_active,
  startDate: t.start_date,
  endDate: t.end_date,
}));

/** The plan status rules' clock on the fixture terms; by default the fixtures' day (FIXTURES_NOW). */
export function fixtureClock(at = "2026-09-30T12:00:00-04:00"): TermClock {
  return { terms: FIXTURE_TERMS, at: new Date(at) };
}
