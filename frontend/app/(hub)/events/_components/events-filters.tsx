"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOURCES } from "@/lib/sources";
import { cn } from "@/lib/utils";
import {
  DEFAULT_EVENTS_VIEW,
  EVENT_KIND_LABELS,
  EVENT_KINDS,
  EVENT_SOURCE_IDS,
  EVENTS_PAGE_SIZE,
  EVENTS_QUERY_MAX,
  eventsHref,
  hasEventFilters,
  normalizeEventsQuery,
  type EventKind,
  type EventSourceId,
  type EventsView,
} from "../_lib/params";
import { EVENT_RANGE_LABELS, EVENT_RANGES, type EventRange } from "../_lib/range";

/**
 * The /events filter bar: a GET form over the URL params (so it works before hydration and without JavaScript:
 * "Search" submits every field), which navigates as soon as a choice changes once hydrated. Native radios and
 * checkboxes styled as Lakeside chips: fieldsets with legends, Space/arrow keys, one visible focus ring on the
 * chip. Changing a filter starts again from the first page of results.
 */

const CHIP = [
  "relative inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 text-sm font-medium whitespace-nowrap text-fg-2 transition-colors select-none md:h-8.5 md:px-3",
  "hover:bg-surface-2 hover:text-fg",
  "has-checked:border-primary has-checked:bg-primary-wash has-checked:text-primary",
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-solid",
].join(" ");

const LEGEND = "mb-2 font-mono text-xs font-medium tracking-label text-fg-3 uppercase";

function toggle<T extends string>(list: readonly T[], value: T, order: readonly T[]): T[] {
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return order.filter((v) => next.includes(v));
}

export interface EventsFiltersProps {
  view: EventsView;
}

export function EventsFilters({ view }: EventsFiltersProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [range, setRange] = useState<EventRange>(view.range);
  const [sources, setSources] = useState<EventSourceId[]>(view.sources);
  const [kinds, setKinds] = useState<EventKind[]>(view.kinds);
  const [q, setQ] = useState(view.q);

  // A navigation that did not come from this form (Clear filters, Back) brings new props: follow them. The
  // canonical href changes exactly when the view does (state adjusted during render, not in an effect).
  const viewKey = eventsHref(view);
  const [syncedKey, setSyncedKey] = useState(viewKey);
  if (syncedKey !== viewKey) {
    setSyncedKey(viewKey);
    setRange(view.range);
    setSources(view.sources);
    setKinds(view.kinds);
    setQ(view.q);
  }

  function go(patch: Partial<EventsView>) {
    const href = eventsHref(
      { range, sources, kinds, q: normalizeEventsQuery(q), limit: EVENTS_PAGE_SIZE },
      { ...patch, limit: EVENTS_PAGE_SIZE },
    );
    startTransition(() => router.push(href, { scroll: false }));
  }

  const filtered = hasEventFilters(view);

  return (
    <form
      action="/events"
      method="get"
      aria-label="Filter events"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-card md:px-5"
      onSubmit={(event) => {
        event.preventDefault();
        go({});
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="events-q">Search events</Label>
        <div className="flex gap-2">
          <Input
            id="events-q"
            type="search"
            name="q"
            value={q}
            maxLength={EVENTS_QUERY_MAX}
            placeholder="Title, place or topic"
            onChange={(event) => setQ(event.target.value)}
            enterKeyHint="search"
          />
          <Button type="submit" variant="secondary">
            <Search aria-hidden />
            Search
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:gap-x-8">
        <fieldset>
          <legend className={LEGEND}>When</legend>
          <div className="flex flex-wrap gap-2">
            {EVENT_RANGES.map((value) => (
              <label key={value} className={CHIP}>
                <input
                  type="radio"
                  name="range"
                  value={value}
                  className="sr-only"
                  checked={range === value}
                  onChange={() => {
                    setRange(value);
                    go({ range: value });
                  }}
                />
                {EVENT_RANGE_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={LEGEND}>Show</legend>
          <div className="flex flex-wrap gap-2">
            {EVENT_KINDS.map((value) => (
              <label key={value} className={CHIP}>
                <input
                  type="checkbox"
                  name="kinds"
                  value={value}
                  className="sr-only"
                  checked={kinds.includes(value)}
                  onChange={() => {
                    const next = toggle(kinds, value, EVENT_KINDS);
                    setKinds(next);
                    go({ kinds: next });
                  }}
                />
                {EVENT_KIND_LABELS[value]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset aria-describedby="events-sources-hint">
          <legend className={LEGEND}>Sources</legend>
          <div className="flex flex-wrap gap-2">
            {EVENT_SOURCE_IDS.map((value) => (
              <label key={value} className={CHIP}>
                <input
                  type="checkbox"
                  name="sources"
                  value={value}
                  className="sr-only"
                  checked={sources.includes(value)}
                  onChange={() => {
                    const next = toggle(sources, value, EVENT_SOURCE_IDS);
                    setSources(next);
                    go({ sources: next });
                  }}
                />
                {SOURCES[value].label}
              </label>
            ))}
          </div>
          <p id="events-sources-hint" className="mt-1.5 text-xs text-fg-3">
            {sources.length === 0 ? "Showing every source." : "Showing only the checked sources."}
          </p>
        </fieldset>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2 text-sm",
          // Nothing to clear: the (usually empty) status line sits under the fieldsets without a gap.
          !filtered && "-mt-4",
        )}
      >
        {filtered ? (
          <Link
            href={eventsHref(DEFAULT_EVENTS_VIEW, { range: view.range })}
            scroll={false}
            className="-my-2 inline-flex min-h-11 items-center gap-1.5 rounded-sm font-semibold text-primary hover:underline md:min-h-0"
          >
            <X aria-hidden className="size-4" />
            Clear filters
          </Link>
        ) : null}
        <p role="status" className="text-fg-3">
          {pending ? "Updating…" : ""}
        </p>
      </div>
    </form>
  );
}
