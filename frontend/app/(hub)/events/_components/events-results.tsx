import Link from "next/link";
import { CalendarDays, CalendarSearch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SourceTagList } from "@/components/ui/source-tag";
import {
  loadEventSourceStatuses,
  loadEvents,
  statusesFor,
  type EventSourceStatus,
  type EventsResult,
} from "../_lib/load";
import {
  DEFAULT_EVENTS_VIEW,
  EVENT_SOURCE_IDS,
  eventsHref,
  hasEventFilters,
  type EventsView,
} from "../_lib/params";
import { windowEndLabel } from "../_lib/present";
import { EVENT_RANGE_LABELS, type EventsWindow } from "../_lib/range";
import { EventList } from "./event-list";
import { ClearFiltersLink } from "./events-filters";

export interface EventsResultsProps {
  view: EventsView;
  window: EventsWindow;
  now: Date;
  timeZone: string;
}

/** Loads one page of events for the view (async server component, inside the page's Suspense boundary). */
export async function EventsResults(props: EventsResultsProps) {
  let result: EventsResult;
  try {
    result = await loadEvents(props.view, props.window);
  } catch (error) {
    console.error("[events] could not list events:", error);
    return <EventsError view={props.view} />;
  }
  let statuses: EventSourceStatus[] | null = null;
  try {
    statuses = await loadEventSourceStatuses(props.now.getTime());
  } catch (error) {
    // Only the "not synced yet" wording depends on it.
    console.error("[events] could not read source statuses:", error);
  }
  return <EventsResultsView {...props} result={result} statuses={statuses} />;
}

export interface EventsResultsViewProps extends EventsResultsProps {
  result: EventsResult;
  statuses: readonly EventSourceStatus[] | null;
}

/** What the results area shows for a loaded page (server-compatible, no hooks). */
export function EventsResultsView({
  view,
  window,
  now,
  timeZone,
  result,
  statuses,
}: EventsResultsViewProps) {
  const count = result.items.length;
  // The range label already says "Today" when the window ends today, so no suffix then ("Today: 11 items.").
  const through =
    window.lastDay === window.today ? null : `through ${windowEndLabel(window.lastDay)}`;
  const summary =
    count === 0
      ? `No items${through ? ` ${through}` : ""}.`
      : `${result.hasMore ? "At least " : ""}${count} ${count === 1 ? "item" : "items"}${through ? `, ${through}` : ""}.`;

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm text-fg-2" data-testid="events-summary">
        <span className="font-semibold text-fg">{EVENT_RANGE_LABELS[view.range]}:</span> {summary}
      </p>
      {count > 0 ? (
        <EventList
          items={result.items}
          hasMore={result.hasMore}
          view={view}
          now={now}
          timeZone={timeZone}
        />
      ) : (
        <EventsEmpty view={view} statuses={statuses} />
      )}
    </div>
  );
}

function EventsEmpty({
  view,
  statuses,
}: {
  view: EventsView;
  statuses: readonly EventSourceStatus[] | null;
}) {
  const requested = statuses ? statusesFor(statuses, view) : null;
  if (requested && requested.length > 0 && requested.every((row) => row.lastSync === null)) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="The campus calendars have not synced yet"
        description={
          <p>
            MakeItSo is fetching them now. Reload this page in a minute to see what is coming up.
          </p>
        }
        action={
          <Button asChild variant="secondary">
            {/* A full reload: the refresh runs on the server after this response. */}
            <a href={eventsHref(view)}>Reload</a>
          </Button>
        }
      >
        <SourceTagList
          label="Calendars MakeItSo reads"
          className="justify-center"
          sources={view.sources.length > 0 ? view.sources : EVENT_SOURCE_IDS}
        />
      </EmptyState>
    );
  }

  const filtered = hasEventFilters(view);
  const wider = view.range !== DEFAULT_EVENTS_VIEW.range;
  return (
    <EmptyState
      icon={filtered ? CalendarSearch : CalendarDays}
      title={filtered ? "Nothing matches these filters" : "Nothing on the campus calendars"}
      description={
        <p>
          {filtered
            ? "Try other words, more sources, or a longer stretch of days."
            : wider
              ? "Look further ahead to see more."
              : "The calendars MakeItSo reads list nothing for the next 14 days."}
        </p>
      }
      action={
        filtered || wider ? (
          <>
            {filtered ? (
              <Button asChild variant="secondary">
                <ClearFiltersLink view={view}>Clear filters</ClearFiltersLink>
              </Button>
            ) : null}
            {wider ? (
              <Button asChild variant="secondary">
                <Link
                  href={eventsHref(view, {
                    range: DEFAULT_EVENTS_VIEW.range,
                    limit: DEFAULT_EVENTS_VIEW.limit,
                  })}
                  scroll={false}
                >
                  Show the next 14 days
                </Link>
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}

function EventsError({ view }: { view: EventsView }) {
  return (
    <ErrorState
      title="Events could not load"
      description="MakeItSo could not read the campus calendars just now. Try again in a moment."
      action={
        <Button asChild>
          <a href={eventsHref(view)}>Try again</a>
        </Button>
      }
    />
  );
}
