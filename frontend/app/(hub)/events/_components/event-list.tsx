import Link from "next/link";
import { CalendarClock, Clock, ExternalLink, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceTag } from "@/components/ui/source-tag";
import type { FeedItem } from "@/lib/types/feeds";
import { eventsHref, nextEventsLimit, type EventsView } from "../_lib/params";
import {
  eventTimeLabel,
  groupEvents,
  isDeadlineItem,
  type EventGroup,
  type PresentOptions,
} from "../_lib/present";

/**
 * The grouped list of feed items (server-compatible, no hooks): one labelled section per America/New_York day
 * (Ongoing first), each item with its time line, an external link to the source page, the location, a short
 * summary and the source tag its stored `source` names (PLAN §5 "Sources (truthfulness)"). Aggregated items carry
 * data-source for expectAllTagged() in e2e. "Show more" is a plain link that raises ?limit.
 */

export interface EventListProps {
  items: readonly FeedItem[];
  hasMore: boolean;
  view: EventsView;
  now: Date;
  timeZone: string;
}

export function EventList({ items, hasMore, view, now, timeZone }: EventListProps) {
  const options: PresentOptions = { now, timeZone };
  const groups = groupEvents(items, options);
  const nextLimit = hasMore ? nextEventsLimit(view.limit) : null;

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <EventGroupSection key={group.key} group={group} options={options} />
      ))}
      {nextLimit ? (
        <div className="flex justify-center">
          <Button asChild variant="secondary">
            <Link href={eventsHref(view, { limit: nextLimit })} scroll={false}>
              Show more
            </Link>
          </Button>
        </div>
      ) : hasMore ? (
        <p className="text-center text-sm text-fg-3">
          This is as many as one page shows. Narrow the dates or the filters to see the rest.
        </p>
      ) : null}
    </div>
  );
}

function EventGroupSection({ group, options }: { group: EventGroup; options: PresentOptions }) {
  const headingId = `events-day-${group.key}`;
  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5 md:pt-4.5 md:pb-2"
    >
      <h2
        id={headingId}
        className="flex flex-wrap items-baseline gap-x-2 text-lg font-strong tracking-title"
      >
        {group.title}
        {group.detail ? (
          <>
            {" "}
            <span className="text-sm font-medium text-fg-3">{group.detail}</span>
          </>
        ) : null}
        <span className="font-mono text-xs font-medium text-fg-3">
          <span className="sr-only">, </span>
          {group.items.length}
          <span className="sr-only">{group.items.length === 1 ? " item" : " items"}</span>
        </span>
      </h2>
      <ol className="mt-2 divide-y divide-line">
        {group.items.map((item) => (
          <EventRow key={item.id} item={item} options={options} />
        ))}
      </ol>
    </section>
  );
}

function EventRow({ item, options }: { item: FeedItem; options: PresentOptions }) {
  const deadline = isDeadlineItem(item);
  const time = eventTimeLabel(item, options);
  return (
    <li
      data-testid="event-item"
      data-source={item.source}
      data-kind={deadline ? "deadline" : item.kind}
      className="flex flex-col gap-1 py-3 md:flex-row md:gap-4"
    >
      <p className="flex shrink-0 items-start gap-1.5 font-mono text-xs leading-5 font-medium text-fg-2 md:w-40">
        {deadline ? (
          <CalendarClock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
        ) : (
          <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-3" />
        )}
        <span>{time}</span>
      </p>
      <div className="min-w-0 flex-1">
        <h3 className="text-base leading-snug font-semibold text-fg">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xs break-words hover:text-primary hover:underline"
          >
            {item.title} <span className="sr-only">(opens in a new tab)</span>
            <ExternalLink aria-hidden className="inline size-3.5 align-[-0.125em] text-fg-3" />
          </a>
        </h3>
        {item.location ? (
          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-fg-2">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fg-3" />
            <span className="min-w-0 break-words">{item.location}</span>
          </p>
        ) : null}
        {item.summaryText ? (
          <p className="mt-1 line-clamp-2 text-sm text-fg-3">{item.summaryText}</p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <SourceTag source={item.source} />
          {deadline ? <Badge variant="warning">Deadline</Badge> : null}
        </div>
      </div>
    </li>
  );
}
