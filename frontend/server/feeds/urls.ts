import "server-only";
import { decode } from "html-entities";
import type { FeedSourceId } from "@/lib/types/feeds";

/**
 * Item link validation (PLAN §7 "Links": external URLs are validated at ingest, https only, host allow-list).
 * Every stored FeedItem.url passes `safeItemUrl` for its own source. This list is about the links we SHOW; the
 * hosts we FETCH from are server/http/external.ts EXTERNAL_HOSTS.
 */
export const ITEM_URL_HOSTS: Readonly<Record<FeedSourceId, readonly string[]>> = {
  wildcatsync: ["wildcatsync.davidson.edu"],
  "hurt-hub": ["hurthub.davidson.edu"],
  library: ["davidson.libcal.com", "www.davidson.edu"],
  davidsonian: ["thedavidsonian.news"],
  // Issues live on the Mailchimp archive; the events they list link to Davidson's calendars.
  "events-digest": ["us6.campaign-archive.com", "www.davidson.edu", "ems.davidson.edu"],
  "davidson-news": ["www.davidson.edu"],
};

const MAX_URL_LENGTH = 2048;

/**
 * The https URL for `raw` if it is an absolute (or `base`-relative) link to one of the source's allow-listed
 * hosts; otherwise null. `http:` links to an allow-listed host are upgraded to https (every listed host serves
 * https). Entities are decoded first (`&amp;` in feed markup) with the strict HTML5 rules, so a query string such
 * as "?a=1&region=2&copy=3" is never read as "®ion" / "©". Credentials are refused.
 */
export function safeItemUrl(
  source: FeedSourceId,
  raw: string | null | undefined,
  base?: string,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = decode(raw.trim(), { level: "html5", scope: "strict" });
  if (!trimmed || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = base ? new URL(trimmed, base) : new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!ITEM_URL_HOSTS[source].includes(host)) return null;
  if (url.port && url.port !== "443") return null;
  url.protocol = "https:";
  url.port = "";
  const out = url.toString();
  return out.length <= MAX_URL_LENGTH ? out : null;
}

/** The first candidate that passes `safeItemUrl`, or null. */
export function pickItemUrl(
  source: FeedSourceId,
  candidates: ReadonlyArray<string | null | undefined>,
  base?: string,
): string | null {
  for (const candidate of candidates) {
    const url = safeItemUrl(source, candidate, base);
    if (url) return url;
  }
  return null;
}

const TRACKING_PARAM = /^(?:utm_[a-z]+|mc_[a-z]+|fbclid|gclid)$/i;

/**
 * A comparison key for "same link" dedupe: lower-case host, no fragment, no tracking parameters, no trailing
 * slash. Not for display.
 */
export function urlDedupeKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) parsed.searchParams.delete(key);
    }
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.hostname.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return url;
  }
}
