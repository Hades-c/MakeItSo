import { describe, expect, it } from "vitest";
import { FEED_SOURCE_IDS } from "@/lib/types/feeds";
import { EXTERNAL_HOSTS } from "@/server/http/external";
import { FEED_SOURCES, HURT_HUB_TRIBE_URL, LIBCAL_HOURS_URL } from "@/server/feeds/config";
import { LIBRARY_HOURS_PAGE } from "@/server/feeds/libcal";
import { ITEM_URL_HOSTS, pickItemUrl, safeItemUrl, urlDedupeKey } from "@/server/feeds/urls";

describe("safeItemUrl (https only, per-source host allow-list)", () => {
  it("accepts https links on the source's hosts", () => {
    expect(safeItemUrl("wildcatsync", "https://wildcatsync.davidson.edu/event/1")).toBe(
      "https://wildcatsync.davidson.edu/event/1",
    );
    expect(safeItemUrl("events-digest", "https://ems.davidson.edu/x?data=a%2fb")).toBe(
      "https://ems.davidson.edu/x?data=a%2fb",
    );
  });

  it("upgrades http on an allow-listed host and decodes &amp;", () => {
    expect(safeItemUrl("library", "http://davidson.libcal.com/event/5?a=1&amp;b=2")).toBe(
      "https://davidson.libcal.com/event/5?a=1&b=2",
    );
  });

  it("refuses other hosts, other schemes, credentials, odd ports and junk", () => {
    expect(safeItemUrl("davidsonian", "https://davidsonian.com/story")).toBeNull();
    expect(safeItemUrl("wildcatsync", "https://evil.example/wildcatsync.davidson.edu")).toBeNull();
    expect(safeItemUrl("wildcatsync", "javascript:alert(1)")).toBeNull();
    expect(safeItemUrl("wildcatsync", "data:text/html,hi")).toBeNull();
    expect(safeItemUrl("wildcatsync", "https://user:pw@wildcatsync.davidson.edu/")).toBeNull();
    expect(safeItemUrl("wildcatsync", "https://wildcatsync.davidson.edu:8443/")).toBeNull();
    expect(safeItemUrl("wildcatsync", "not a url")).toBeNull();
    expect(safeItemUrl("wildcatsync", null)).toBeNull();
    expect(safeItemUrl("hurt-hub", "https://www.eventbrite.com/e/1")).toBeNull();
  });

  it("resolves relative links against the feed's base", () => {
    expect(safeItemUrl("davidson-news", "/news/2026/09/28/x", "https://www.davidson.edu/")).toBe(
      "https://www.davidson.edu/news/2026/09/28/x",
    );
    expect(
      pickItemUrl("wildcatsync", [
        null,
        "https://x.example/",
        "https://wildcatsync.davidson.edu/e",
      ]),
    ).toBe("https://wildcatsync.davidson.edu/e");
  });

  it("dedupe keys ignore the fragment, tracking parameters, host case and a trailing slash", () => {
    expect(urlDedupeKey("https://WildcatSync.davidson.edu/event/1/?utm_source=x#top")).toBe(
      urlDedupeKey("https://wildcatsync.davidson.edu/event/1"),
    );
    expect(urlDedupeKey("https://a.example/x?id=1")).not.toBe(
      urlDedupeKey("https://a.example/x?id=2"),
    );
  });
});

describe("feed configuration", () => {
  it("every configured upstream URL is https on the source's fetch allow-list", () => {
    for (const source of FEED_SOURCE_IDS) {
      for (const channel of FEED_SOURCES[source].channels) {
        const url = new URL(channel.url);
        expect(url.protocol).toBe("https:");
        expect(EXTERNAL_HOSTS[source]).toContain(url.hostname);
      }
    }
    expect(EXTERNAL_HOSTS["hurt-hub"]).toContain(new URL(HURT_HUB_TRIBE_URL).hostname);
    expect(EXTERNAL_HOSTS.library).toContain(new URL(LIBCAL_HOURS_URL).hostname);
  });

  it("every fallback link and the hours page pass their source's item allow-list", () => {
    for (const source of FEED_SOURCE_IDS) {
      for (const channel of FEED_SOURCES[source].channels) {
        if (channel.fallbackUrl)
          expect(safeItemUrl(source, channel.fallbackUrl)).toBe(channel.fallbackUrl);
      }
      expect(ITEM_URL_HOSTS[source].length).toBeGreaterThan(0);
    }
    expect(safeItemUrl("library", LIBRARY_HOURS_PAGE)).toBe(LIBRARY_HOURS_PAGE);
  });

  it("freshness is 30 to 60 minutes per source; The Davidsonian is thedavidsonian.news only", () => {
    for (const source of FEED_SOURCE_IDS) {
      expect(FEED_SOURCES[source].freshnessMs).toBeGreaterThanOrEqual(30 * 60_000);
      expect(FEED_SOURCES[source].freshnessMs).toBeLessThanOrEqual(60 * 60_000);
    }
    expect(FEED_SOURCES.davidsonian.channels.map((c) => new URL(c.url).hostname)).toEqual([
      "thedavidsonian.news",
    ]);
    expect(ITEM_URL_HOSTS.davidsonian).not.toContain("davidsonian.com");
  });
});
