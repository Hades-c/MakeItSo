import { queryString, routes } from "@/lib/routes";
import type { FeedKind, FeedSourceId } from "@/lib/types/feeds";
import { DEFAULT_EVENT_RANGE, isEventRange, type EventRange } from "./range";

/**
 * /events URL state (PLAN §7 "State": filters live in URL search params, named like EventsQuerySchema). Pure and
 * isomorphic: the page parses its searchParams with it, the filter island builds hrefs with it.
 *
 *   ?range=today|week|14d          date preset (default 14d)
 *   ?sources=wildcatsync&sources=… feed sources; none = every source
 *   ?kinds=event|deadline          none = both
 *   ?q=…                           words in the title, location or summary
 *   ?limit=…                       how many items to show ("Show more" raises it by EVENTS_PAGE_SIZE)
 *
 * Parsing is lenient: a page never errors on a hand-edited URL. Unknown values are dropped, repeated and
 * comma-separated lists both work, and the output is canonical (registry order, no duplicates), so equal filters
 * always give the same href.
 */

/**
 * The feed sources that carry events or deadlines (server/feeds/config.ts channels: The Davidsonian and Davidson
 * News only publish news). contractRequest: export this list from lib/types/feeds.ts.
 */
export const EVENT_SOURCE_IDS = [
  "wildcatsync",
  "hurt-hub",
  "library",
  "events-digest",
] as const satisfies readonly FeedSourceId[];
export type EventSourceId = (typeof EVENT_SOURCE_IDS)[number];

export const EVENT_KINDS = ["event", "deadline"] as const satisfies readonly FeedKind[];
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABELS: Readonly<Record<EventKind, string>> = {
  event: "Events",
  deadline: "Deadlines",
};

export const EVENTS_PAGE_SIZE = 50;
/** EventsQuerySchema's `limit` maximum. */
export const EVENTS_MAX_LIMIT = 500;
/** EventsQuerySchema's `q` maximum. */
export const EVENTS_QUERY_MAX = 100;

export interface EventsView {
  range: EventRange;
  sources: EventSourceId[];
  kinds: EventKind[];
  q: string;
  limit: number;
}

export type SearchParamsRecord = Readonly<Record<string, string | string[] | undefined>>;

export const DEFAULT_EVENTS_VIEW: EventsView = {
  range: DEFAULT_EVENT_RANGE,
  sources: [],
  kinds: [],
  q: "",
  limit: EVENTS_PAGE_SIZE,
};

function values(value: string | readonly string[] | undefined): string[] {
  if (value === undefined) return [];
  const list: readonly string[] = typeof value === "string" ? [value] : value;
  return list.flatMap((part) => part.split(",")).map((part) => part.trim());
}

function first(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

/** Keep the allowed values, in `allowed` order, once each. */
function pick<T extends string>(allowed: readonly T[], input: readonly string[]): T[] {
  const wanted = new Set(input);
  return allowed.filter((value) => wanted.has(value));
}

/** Same rules as lib/types/common.ts queryText: NFKC, trimmed, inner whitespace collapsed, cut to the maximum. */
export function normalizeEventsQuery(value: string | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, EVENTS_QUERY_MAX);
}

function parseLimit(value: string | undefined): number {
  if (!value || !/^\d{1,4}$/.test(value.trim())) return EVENTS_PAGE_SIZE;
  const limit = Number(value.trim());
  if (limit < 1) return EVENTS_PAGE_SIZE;
  return Math.min(limit, EVENTS_MAX_LIMIT);
}

export function parseEventsParams(params: SearchParamsRecord = {}): EventsView {
  const range = first(params.range);
  const sources = pick(EVENT_SOURCE_IDS, values(params.sources));
  const kinds = pick(EVENT_KINDS, values(params.kinds));
  return {
    range: isEventRange(range) ? range : DEFAULT_EVENT_RANGE,
    // Every source (or both kinds) selected is the same as none: keep the URL short.
    sources: sources.length === EVENT_SOURCE_IDS.length ? [] : sources,
    kinds: kinds.length === EVENT_KINDS.length ? [] : kinds,
    q: normalizeEventsQuery(first(params.q)),
    limit: parseLimit(first(params.limit)),
  };
}

/**
 * The /events href for a view (optionally changed by `patch`), through routes.events() for the params it knows.
 * Default values are left out. contractRequest: routes.events() should take `range` and `limit` itself.
 */
export function eventsHref(view: EventsView, patch: Partial<EventsView> = {}): string {
  const next = { ...view, ...patch };
  const base = routes.events({ sources: next.sources, kinds: next.kinds, q: next.q });
  const extra = queryString({
    range: next.range === DEFAULT_EVENT_RANGE ? undefined : next.range,
    limit: next.limit === EVENTS_PAGE_SIZE ? undefined : next.limit,
  });
  if (!extra) return base;
  return base.includes("?") ? `${base}&${extra.slice(1)}` : `${base}${extra}`;
}

/** Whether anything narrows the list (the range is a choice, not a filter). */
export function hasEventFilters(view: EventsView): boolean {
  return view.sources.length > 0 || view.kinds.length > 0 || view.q !== "";
}

/** The next "Show more" limit, or null when the list is already at the maximum. */
export function nextEventsLimit(limit: number): number | null {
  if (limit >= EVENTS_MAX_LIMIT) return null;
  return Math.min(limit + EVENTS_PAGE_SIZE, EVENTS_MAX_LIMIT);
}
