import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { now as serverNow } from "@/server/clock";
import { readEnv } from "@/server/env";
import { cn } from "@/lib/utils";
import { featureEnabled, loadFlags } from "@/server/features";
import { etDay, stripDays } from "@/server/today";
import { CampusPanel } from "./_components/campus-panel";
import { DegreePanel } from "./_components/degree-panel";
import { DueSoonPanel } from "./_components/due-soon-panel";
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
 * Two columns from lg. Below lg the columns dissolve (display: contents) into one stack ordered like the Lakeside
 * phone mockup: Today, Due soon, This week on campus, Degree progress, Opportunities, Quick links (the most
 * time-sensitive panels first), while the desktop keeps timeline + degree on the left.
 */
const GRID =
  "flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start";
const STACK = "contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5";
const SLOT = "min-w-0 lg:order-none";

/**
 * /today (PLAN §3, W7): the student's day on one page, rendered on the server in America/New_York from the
 * server clock (server/clock.ts now()).
 *
 * - h1: the deterministic one-sentence day summary (server/today summary → lib/day-summary), the date and term,
 *   counts, and the five-day strip (?day= shows another strip day on the timeline).
 * - Plan <registration term> (around the WebTree window) and Browse courses; an onboarding nudge until set up.
 * - Left: the day timeline; degree progress. Right: Due soon; This week on campus (FEATURE_EVENTS only);
 *   Opportunities; Quick links.
 *
 * Each block is its own async server component in its own Suspense boundary and PanelBoundary (error boundary)
 * with its own error state, so a slow or failing source (catalog, plan, feeds), or a panel that throws while it
 * renders, never holds up or takes down the rest. Every aggregated item carries
 * the tag of its stored source (data-aggregated + SourceTag).
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
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <>
      <Suspense fallback={<HeaderSkeleton />}>
        <TodayHeader
          userId={user.id}
          now={now}
          timeZone={timeZone}
          stripDays={days}
          selected={day}
          eventsOn={eventsOn}
          {...(firstName ? { firstName } : {})}
        />
      </Suspense>
      <Suspense fallback={null}>
        <TodayActions userId={user.id} now={now} timeZone={timeZone} />
      </Suspense>
      <div className={GRID}>
        <div className={STACK}>
          <div className={cn(SLOT, "order-1")}>
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
          <div className={cn(SLOT, "order-4")}>
            <PanelBoundary id="degree" title="Degree progress" what="Your degree progress">
              <Suspense fallback={<PanelSkeleton id="degree" title="Degree progress" rows={2} />}>
                <DegreePanel userId={user.id} />
              </Suspense>
            </PanelBoundary>
          </div>
        </div>
        <div className={STACK}>
          <div className={cn(SLOT, "order-2")}>
            <PanelBoundary id="due-soon" title="Due soon" what="Due soon">
              <Suspense fallback={<PanelSkeleton id="due-soon" title="Due soon" />}>
                <DueSoonPanel userId={user.id} now={now} />
              </Suspense>
            </PanelBoundary>
          </div>
          {eventsOn ? (
            <div className={cn(SLOT, "order-3")}>
              <PanelBoundary id="campus" title="This week on campus" what="Campus events">
                <Suspense fallback={<PanelSkeleton id="campus" title="This week on campus" />}>
                  <CampusPanel now={now} timeZone={timeZone} />
                </Suspense>
              </PanelBoundary>
            </div>
          ) : null}
          <div className={cn(SLOT, "order-5")}>
            <PanelBoundary id="opportunities" title="Opportunities" what="Opportunities">
              <Suspense fallback={<PanelSkeleton id="opportunities" title="Opportunities" />}>
                <OpportunitiesPanel userId={user.id} now={now} careersOn={careersOn} />
              </Suspense>
            </PanelBoundary>
          </div>
          <div className={cn(SLOT, "order-6")}>
            <PanelBoundary id="quick-links" title="Quick links" what="Quick links">
              <QuickLinks />
            </PanelBoundary>
          </div>
        </div>
      </div>
    </>
  );
}
