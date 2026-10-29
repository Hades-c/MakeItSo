import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { now as serverNow } from "@/server/clock";
import { readEnv } from "@/server/env";
import { cn } from "@/lib/utils";
import { featureEnabled, loadFlags } from "@/server/features";
import { syncMoodleIfDue } from "@/server/moodle";
import { etDay, stripDays } from "@/server/today";
import { CampusPanel } from "./_components/campus-panel";
import { DUE_SOON_TITLE, DueSoonPanel } from "./_components/due-soon-panel";
import { OpportunitiesPanel } from "./_components/opportunities-panel";
import { PanelBoundary } from "./_components/panel-boundary";
import { HeaderSkeleton, PanelSkeleton } from "./_components/panel-states";
import { QuickLinks } from "./_components/quick-links";
import { TimelinePanel } from "./_components/timeline-panel";
import { TodayActions } from "./_components/today-actions";
import { TodayHeader } from "./_components/today-header";
import { parseDayParam, type TodaySearchParams } from "./_lib/params";

export const metadata: Metadata = { title: "Today" };

/**
 * One stack below lg, in the DOM's order, which is the phone's priority order (the Lakeside phone mockup): Today,
 * Due for you, This week on campus, Opportunities, Quick links. From lg the same blocks sit on a 12-column grid in
 * rows, read left to right and top to bottom in that same order (no CSS order: WCAG 1.3.2), so both halves of the
 * page carry content at every scroll position:
 *
 * - row 1: the day timeline (7 of 12) beside Due for you (5), which lists its first DUE_SOON_SHOWN rows and holds
 *   the rest behind "Show N more", so the two end close together;
 * - row 2: This week on campus (5) beside Opportunities (7), the wider half for the longer list;
 * - row 3: Quick links across the page.
 *
 * Without the events section, Opportunities (7) and Quick links (5) share row 2. The cards in a row stretch to
 * the row's height, so their bottoms line up.
 */
const GRID = "flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-stretch";
const SLOT = "min-w-0 lg:*:h-full";

/**
 * /today (PLAN §3, W7): the student's day on one page, rendered on the server in America/New_York from the
 * server clock (server/clock.ts now()).
 *
 * - h1: a fixed headline, the date and term, one line under it (the WebTree window while it is open, with "Plan
 *   <term>"; else "N due for you in the next two weeks"), and the five-day strip (?day= shows another strip day on
 *   the timeline).
 * - An onboarding nudge until first-run setup is done; nothing else in the action row.
 * - Then, in rows from lg (GRID): the day timeline and Due for you; This week on campus (FEATURE_EVENTS only)
 *   and Opportunities; Quick links.
 *
 * Each block is its own async server component in its own Suspense boundary and PanelBoundary (error boundary)
 * with its own error state, so a slow or failing source (catalog, plan, feeds), or a panel that throws while it
 * renders, never holds up or takes down the rest.
 */
export default async function TodayPage({
  searchParams,
}: { searchParams?: Promise<TodaySearchParams> } = {}) {
  const user = await requireUser();
  const now = serverNow();
  const timeZone = readEnv("APP_TIMEZONE");
  const today = etDay(now);
  const days = stripDays(today);
  const day = parseDayParam((await searchParams) ?? {}, today, days);
  const flags = loadFlags();
  const eventsOn = featureEnabled(flags, "events");
  const careersOn = featureEnabled(flags, "careers");
  // A connected Moodle calendar 6+ hours since its last sync: synced after this page is sent (one indexed read here).
  if (flags.moodle) await syncMoodleIfDue(user.id);

  return (
    <>
      <Suspense fallback={<HeaderSkeleton />}>
        <TodayHeader
          userId={user.id}
          now={now}
          timeZone={timeZone}
          stripDays={days}
          selected={day}
        />
      </Suspense>
      <Suspense fallback={null}>
        <TodayActions userId={user.id} />
      </Suspense>
      <div className={GRID}>
        <div className={cn(SLOT, "lg:col-span-7")}>
          <PanelBoundary id="timeline" title="Today" what="Your schedule">
            <Suspense fallback={<PanelSkeleton id="timeline" title="Today" rows={4} />}>
              <TimelinePanel
                userId={user.id}
                now={now}
                timeZone={timeZone}
                day={day}
                stripDays={days}
                eventsOn={eventsOn}
              />
            </Suspense>
          </PanelBoundary>
        </div>
        <div className={cn(SLOT, "lg:col-span-5")}>
          <PanelBoundary id="due-soon" title={DUE_SOON_TITLE} what={DUE_SOON_TITLE}>
            <Suspense fallback={<PanelSkeleton id="due-soon" title={DUE_SOON_TITLE} />}>
              <DueSoonPanel userId={user.id} now={now} />
            </Suspense>
          </PanelBoundary>
        </div>
        {eventsOn ? (
          <div className={cn(SLOT, "lg:col-span-5")}>
            <PanelBoundary id="campus" title="This week on campus" what="Campus events">
              <Suspense fallback={<PanelSkeleton id="campus" title="This week on campus" />}>
                <CampusPanel now={now} timeZone={timeZone} />
              </Suspense>
            </PanelBoundary>
          </div>
        ) : null}
        <div className={cn(SLOT, "lg:col-span-7")}>
          <PanelBoundary id="opportunities" title="Opportunities" what="Opportunities">
            <Suspense fallback={<PanelSkeleton id="opportunities" title="Opportunities" />}>
              <OpportunitiesPanel userId={user.id} now={now} careersOn={careersOn} />
            </Suspense>
          </PanelBoundary>
        </div>
        <div className={cn(SLOT, eventsOn ? "lg:col-span-12" : "lg:col-span-5")}>
          <PanelBoundary id="quick-links" title="Quick links" what="Quick links">
            <QuickLinks />
          </PanelBoundary>
        </div>
      </div>
    </>
  );
}
