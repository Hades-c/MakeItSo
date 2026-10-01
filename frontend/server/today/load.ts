import "server-only";
import { cache } from "react";
import type { ClassStanding, TermCode } from "@/lib/term";
import { termLabel } from "@/lib/term";
import type { ResolvedTerms } from "@/lib/types/catalog";
import type { FeedItem } from "@/lib/types/feeds";
import type { DaySchedule, PlanProgress, PlanView } from "@/lib/types/plan";
import { getProfile, type ProfileView } from "@/server/auth/profile";
import { resolveTerms } from "@/server/catalog";
import { deadlinesBetween, type ContentDeadline } from "@/server/content/deadlines";
import { listEvents } from "@/server/feeds";
import { MissingFixtureError } from "@/server/http/fixtures";
import { getDaySchedule, getPlan, getProgress } from "@/server/plan";
import { addDaysToKey, dayBounds } from "@/server/today/time";

/**
 * Today's data loaders (server components call these; no self-HTTP). Each is memoised per request with React
 * cache(), so the headline, the strip and the panels share one read of the plan, the terms and each day's
 * schedule. `attempt()` turns a failure into `{ ok: false }` (logged) so one panel's outage never takes the page
 * down; a missing test fixture is never hidden.
 */

export type Loaded<T> = { ok: true; value: T } | { ok: false };

export async function attempt<T>(what: string, work: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    console.error(`[today] could not load ${what}:`, error);
    return { ok: false };
  }
}

/**
 * Runs a panel's pure computation (building the agenda, Due soon, labels) and turns a throw into null (logged),
 * so the panel shows its small error state instead of taking the whole page down; a missing test fixture is
 * never hidden. Render errors inside the panel's components are caught by its PanelBoundary.
 */
export function safely<T>(what: string, work: () => T): T | null {
  try {
    return work();
  } catch (error) {
    if (error instanceof MissingFixtureError) throw error;
    console.error(`[today] could not build ${what}:`, error);
    return null;
  }
}

export const loadProfile = cache((userId: string): Promise<Loaded<ProfileView>> =>
  attempt("the profile", () => getProfile(userId)),
);

export const loadTerms = cache((): Promise<Loaded<ResolvedTerms>> =>
  attempt("the terms", () => resolveTerms()),
);

export const loadPlan = cache((userId: string): Promise<Loaded<PlanView>> =>
  attempt("the plan", () => getPlan(userId)),
);

export const loadProgress = cache((userId: string): Promise<Loaded<PlanProgress>> =>
  attempt("degree progress", () => getProgress(userId)),
);

export const loadSchedule = cache((userId: string, day: string): Promise<Loaded<DaySchedule>> =>
  attempt(`the schedule for ${day}`, () => getDaySchedule(userId, day)),
);

/** Stored feed events and deadlines overlapping the Davidson days from..to (inclusive). */
export const loadFeedItems = cache((from: string, to: string): Promise<Loaded<FeedItem[]>> =>
  attempt("campus events", () =>
    listEvents({
      from: dayBounds(from).start.toISOString(),
      to: dayBounds(to).end.toISOString(),
      kinds: ["event", "deadline"],
      limit: 500,
    }),
  ),
);

/** Upcoming campus events from `at` for `days` days (This week on campus). */
export const loadCampusEvents = cache(
  (atIso: string, days: number, limit: number): Promise<Loaded<FeedItem[]>> =>
    attempt("this week on campus", () =>
      listEvents({
        from: atIso,
        to: new Date(Date.parse(atIso) + days * 86_400_000).toISOString(),
        kinds: ["event"],
        limit,
      }),
    ),
);

/** Curated deadlines (calendar + programs) on the Davidson days from..to; pure content, never fails at runtime. */
export function contentDeadlines(from: string, to: string): ContentDeadline[] {
  return deadlinesBetween(from, to);
}

/** The student's standing (class year) for audience checks; null when the profile is unavailable. */
export function standingOf(profile: Loaded<ProfileView>): ClassStanding | null {
  return profile.ok ? profile.value.standing.standing : null;
}

/**
 * The first class day after `day` (up to a week ahead) with its schedule, for the timeline's "next up" line.
 * `load` reads one day (pass `(d) => loadSchedule(userId, d)`).
 */
export async function nextClassDay(
  day: string,
  load: (day: string) => Promise<Loaded<DaySchedule>>,
): Promise<{ day: string; schedule: DaySchedule } | null> {
  for (let i = 1; i <= 7; i++) {
    const next = addDaysToKey(day, i);
    const loaded = await load(next);
    if (!loaded.ok) return null;
    if (loaded.value.entries.length > 0) return { day: next, schedule: loaded.value };
    if (loaded.value.empty === "no-term" || loaded.value.empty === "no-sections") return null;
  }
  return null;
}

/** "Fall 2026" for the schedule's term, else the current term. */
export function scheduleTermLabel(
  schedule: Loaded<DaySchedule>,
  terms: Loaded<ResolvedTerms>,
): string | null {
  const code: TermCode | null =
    (schedule.ok ? schedule.value.termCode : null) ?? (terms.ok ? terms.value.current : null);
  return code ? termLabel(code) : null;
}
