import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { formatLongDate } from "@/lib/format";
import { now } from "@/server/clock";
import { readEnv } from "@/server/env";
import { featureMetadata, requireFeature } from "@/server/features";
import { EventSourcesCard } from "./_components/event-sources";
import { EventsFilters } from "./_components/events-filters";
import { EventsResults } from "./_components/events-results";
import { LibraryHoursCard } from "./_components/library-hours";
import { CardSkeleton, EventsResultsSkeleton } from "./_components/skeletons";
import { parseEventsParams, type SearchParamsRecord } from "./_lib/params";
import { rangeWindow } from "./_lib/range";

/**
 * /events (PLAN §3; R2 behind FEATURE_EVENTS): the synced campus feeds (WildcatSync, Hurt Hub, library, Events
 * Digest) in one list, grouped by America/New_York day, with filters in the URL (sources, kinds, q, a date preset)
 * and "Show more" through ?limit. Today's library hours and each calendar's last sync sit alongside.
 *
 * - generateMetadata is featureMetadata() and requireFeature() is the first line (404 while the flag is off; no
 *   static `metadata`, no loading.tsx).
 * - "Today" and every date boundary come from the server's now() in APP_TIMEZONE, rendered on the server.
 * - The page itself reads nothing: each data block is an async server component in its own Suspense boundary, so
 *   a slow read (LibCal's inline refresh waits up to 5 s) never holds up the rest, and each block has its own
 *   loading, empty and error state.
 */
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("events", { title: "Events" });
}

export default async function EventsPage({
  searchParams,
}: { searchParams?: Promise<SearchParamsRecord> } = {}) {
  await requireFeature("events");
  const view = parseEventsParams((await searchParams) ?? {});
  const at = now();
  const timeZone = readEnv("APP_TIMEZONE");
  const window = rangeWindow(view.range, at, timeZone);

  return (
    <>
      <PageHeader
        kicker={formatLongDate(at, timeZone)}
        title="Events"
        subtitle="Campus events and deadlines from every calendar, in one list."
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <EventsFilters view={view} />
          <Suspense fallback={<EventsResultsSkeleton />}>
            <EventsResults view={view} window={window} now={at} timeZone={timeZone} />
          </Suspense>
        </div>
        <aside aria-label="Library hours and sources" className="flex min-w-0 flex-col gap-5">
          <Suspense fallback={<CardSkeleton title="Library hours" />}>
            <LibraryHoursCard today={window.today} now={at} timeZone={timeZone} />
          </Suspense>
          <Suspense fallback={<CardSkeleton title="Sources" />}>
            <EventSourcesCard now={at} timeZone={timeZone} />
          </Suspense>
        </aside>
      </div>
    </>
  );
}
