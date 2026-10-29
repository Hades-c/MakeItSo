import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { formatLongDate } from "@/lib/format";
import { now } from "@/server/clock";
import { readEnv } from "@/server/env";
import { requireUser } from "@/server/auth/session";
import { featureMetadata, requireFeature } from "@/server/features";
import { EventsFilters } from "./_components/events-filters";
import { EventsResults } from "./_components/events-results";
import { EventsResultsSkeleton } from "./_components/skeletons";
import { parseEventsParams, type SearchParamsRecord } from "./_lib/params";
import { rangeWindow } from "./_lib/range";

/**
 * /events (PLAN §3; R2 behind FEATURE_EVENTS): the synced campus feeds (WildcatSync, Hurt Hub, library, Events
 * Digest) in one list, grouped by America/New_York day, with filters in the URL (sources, kinds, q, a date preset)
 * and "Show more" through ?limit. No general hours card: an hours change surfaces on the event it concerns.
 *
 * - generateMetadata is featureMetadata() and requireFeature() is the first line (404 while the flag is off; no
 *   static `metadata`, no loading.tsx).
 * - "Today" and every date boundary come from the server's now() in APP_TIMEZONE, rendered on the server.
 * - The page itself reads nothing: the list is an async server component in its own Suspense boundary, with its
 *   own loading, empty and error state.
 */
export async function generateMetadata(): Promise<Metadata> {
  return featureMetadata("events", { title: "Events" });
}

export default async function EventsPage({
  searchParams,
}: { searchParams?: Promise<SearchParamsRecord> } = {}) {
  await requireFeature("events");
  // Its own sign-in check: the hub layout renders in parallel with the page, so a page relying on the layout
  // alone streams its content into the signed-out visitor's redirect.
  await requireUser();
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
      <div className="flex min-w-0 flex-col gap-5">
        <EventsFilters view={view} />
        <Suspense fallback={<EventsResultsSkeleton />}>
          <EventsResults view={view} window={window} now={at} timeZone={timeZone} />
        </Suspense>
      </div>
    </>
  );
}
