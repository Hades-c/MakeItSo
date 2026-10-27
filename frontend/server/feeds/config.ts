import "server-only";
import type { FeedSourceId } from "@/lib/types/feeds";
import { hurtHubExternalId } from "@/server/feeds/tribe";
import type { RssItem } from "@/server/feeds/rss";
import { HTML_INPUT_MAX, sliceText, summaryFromHtml } from "@/server/feeds/text";
import { MINUTE_MS } from "@/server/feeds/time";

/**
 * The campus feeds (PLAN §6.1 W4a). URLs, formats and observed item counts are recorded in the scratchpad's
 * content-prep links → feeds (checked 2026-09-30); every URL is served by tests/fixtures/external in fixtures
 * mode. Athletics is link-out only (no verifiable feed). Never davidsonian.com (casino spam): The Davidsonian is
 * thedavidsonian.news.
 */

export type ChannelFormat = "ics" | "rss-news" | "digest" | "libcal-hours";

export interface FeedChannel {
  /** Logical feed inside the source; stored on every item (models/FeedItem.ts `channel`). */
  channel: string;
  format: ChannelFormat;
  url: string;
  /** Hurt Hub: the Tribe REST API when the iCal export fails. */
  fallback?: "tribe";
  /** Link for events without their own URL (must pass the source's item allow-list). */
  fallbackUrl?: string;
  /** Upstream UID → stored externalId. */
  externalIdFor?: (uid: string) => string;
  /** Source-specific description cleanup before the summary is cut. */
  cleanDescription?: (text: string) => string;
  /** Source-specific news summary. */
  summarize?: (item: RssItem) => string | null;
}

export interface FeedSourceConfig {
  /**
   * How long a successful sync counts as fresh (30–60 min): the on-demand refresh (listEvents,
   * getLibraryHours) skips a source synced more recently than this.
   */
  freshnessMs: number;
  channels: readonly FeedChannel[];
}

/** WildcatSync appends "Additional Information can be found at: <the event URL>": the item links there already. */
export function cleanWildcatSyncDescription(text: string): string {
  return text.replace(/\s*Additional Information can be found at:\s*\S*\s*$/i, "").trim();
}

/** The content of the first `<p>` whose opening tag `opener` matches (searched from `from`), up to its `</p>`. */
function paragraphAfter(html: string, opener: RegExp, from = 0): string | null {
  const open = new RegExp(opener.source, "gi");
  open.lastIndex = from;
  const match = open.exec(html);
  if (!match) return null;
  const start = match.index + match[0].length;
  const close = /<\/p\s*>/gi;
  close.lastIndex = start;
  const end = close.exec(html);
  return end ? html.slice(start, end.index) : null;
}

/**
 * davidson.edu's RSS description is the whole rendered article (byline, date, headline, photo caption, body).
 * The teaser is the paragraph right after Drupal's numeric timestamp, else the "intro" paragraph, else the first
 * body paragraph; otherwise no summary rather than a byline soup. Only the first HTML_INPUT_MAX characters are
 * read (the teaser comes within the first few thousand), and every search is linear.
 */
export function summarizeDavidsonNews(item: RssItem): string | null {
  const html = sliceText(item.description ?? item.content ?? "", HTML_INPUT_MAX);
  const article = html.search(/<article\b/i);
  const lead =
    paragraphAfter(html, /\b\d{9,11}\s*<p\b[^<>]*>/) ??
    paragraphAfter(html, /<p\b[^<>]*\bclass\s*=\s*"[^"<>]*\bintro\b[^"<>]*"[^<>]*>/) ??
    (article >= 0 ? paragraphAfter(html, /<p\b[^<>]*>/, article) : null);
  return lead ? summaryFromHtml(lead) : null;
}

/** WordPress feeds may end the excerpt with "The post … appeared first on …". */
export function summarizeWordPress(item: RssItem): string | null {
  const text = summaryFromHtml(item.description ?? item.content);
  return text ? text.replace(/\s*The post .+ appeared first on .+$/i, "").trim() || null : null;
}

export const LIBCAL_HOURS_URL =
  "https://davidson.libcal.com/api_hours_today.php?iid=3662&lid=0&format=json&systemTime=0";
export const HURT_HUB_TRIBE_URL = "https://hurthub.davidson.edu/wp-json/tribe/events/v1/events";

export const FEED_SOURCES: Readonly<Record<FeedSourceId, FeedSourceConfig>> = {
  wildcatsync: {
    freshnessMs: 30 * MINUTE_MS,
    channels: [
      {
        channel: "events",
        format: "ics",
        url: "https://wildcatsync.davidson.edu/events.ics",
        fallbackUrl: "https://wildcatsync.davidson.edu/events",
        cleanDescription: cleanWildcatSyncDescription,
      },
      { channel: "news", format: "rss-news", url: "https://wildcatsync.davidson.edu/news.rss" },
    ],
  },
  "hurt-hub": {
    freshnessMs: 60 * MINUTE_MS,
    channels: [
      {
        channel: "events",
        format: "ics",
        url: "https://hurthub.davidson.edu/events/?ical=1",
        fallback: "tribe",
        fallbackUrl: "https://hurthub.davidson.edu/events/",
        externalIdFor: hurtHubExternalId,
      },
    ],
  },
  library: {
    freshnessMs: 30 * MINUTE_MS,
    channels: [
      { channel: "hours", format: "libcal-hours", url: LIBCAL_HOURS_URL },
      {
        channel: "events",
        format: "ics",
        url: "https://davidson.libcal.com/ical_subscribe.php?src=p&cid=7393",
        fallbackUrl: "https://www.davidson.edu/library",
      },
    ],
  },
  davidsonian: {
    freshnessMs: 60 * MINUTE_MS,
    channels: [
      {
        channel: "news",
        format: "rss-news",
        url: "https://thedavidsonian.news/feed/",
        summarize: summarizeWordPress,
      },
    ],
  },
  "events-digest": {
    freshnessMs: 60 * MINUTE_MS,
    channels: [
      {
        channel: "events",
        format: "digest",
        url: "https://us6.campaign-archive.com/feed?u=a06862fb4e666d96846f036ba&id=2ac4133186",
      },
    ],
  },
  "davidson-news": {
    freshnessMs: 60 * MINUTE_MS,
    channels: [
      {
        channel: "news",
        format: "rss-news",
        url: "https://www.davidson.edu/rss.xml",
        summarize: summarizeDavidsonNews,
      },
    ],
  },
};
