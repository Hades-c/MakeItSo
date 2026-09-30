import "server-only";
import type { FeedKind, FeedSourceId, LibraryLocationHours } from "@/lib/types/feeds";

/**
 * A feed entry after parsing and normalisation, before storage (server/feeds/store.ts turns it into a
 * `feeditems` document). Parsers guarantee: non-empty one-line title ≤ 300 chars, https URL on the source's
 * allow-list, summary ≤ 500 chars of plain text, instants (not wall-clock times).
 */
export interface NormalizedFeedItem {
  source: FeedSourceId;
  /** Logical feed inside the source ("events", "news", "hours", "issues"). */
  channel: string;
  externalId: string;
  kind: FeedKind;
  title: string;
  url: string;
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  summaryText: string | null;
  hours?: NormalizedHours;
}

export interface NormalizedHours {
  date: string;
  locationId: string;
  status: LibraryLocationHours["status"];
  text: string;
  order: number;
}

/** Thrown when a payload is not the format we expected (HTML error page, truncated XML, ...). */
export class FeedParseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FeedParseError";
  }
}

/** What every parser needs to know about "now" and where it is. */
export interface ParseContext {
  source: FeedSourceId;
  channel: string;
  now: Date;
  /** Campus zone (America/New_York): floating times, all-day dates and "today". */
  timeZone: string;
}
