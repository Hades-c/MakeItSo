import { describe, expect, it } from "vitest";
import { FEED_SOURCES, summarizeDavidsonNews } from "@/server/feeds/config";
import { dropStaleItems, normalizeNews, parseRss, STALE_NEWS_DAYS } from "@/server/feeds/rss";
import { FeedParseError } from "@/server/feeds/types";
import { context, fixture, rss } from "./helpers";

const DAY = 86_400_000;

function news(source: "wildcatsync" | "davidsonian" | "davidson-news", file: string) {
  const channel = FEED_SOURCES[source].channels.find((c) => c.format === "rss-news")!;
  return normalizeNews(parseRss(fixture(file)), {
    ...context(source, "news"),
    summarize: channel.summarize,
  });
}

describe("parseRss", () => {
  it("reads items, guid objects, CDATA and dates", () => {
    const channel = parseRss(fixture("wildcatsync/news.rss"));
    expect(channel.title).toBe("Davidson College Public News Articles");
    expect(channel.items).toHaveLength(15);
    const first = channel.items[0]!;
    expect(first.guid).toBe("https://wildcatsync.davidson.edu/news/343113");
    expect(first.pubDate?.toISOString()).toBe("2026-09-30T13:48:45.000Z");
    expect(first.description).toContain("<strong>");
  });

  it("decodes entities in titles once", () => {
    const items = news("davidson-news", "davidson-news/rss.xml").items;
    expect(items.map((i) => i.title)).toContain("Bacteria Making You Sick? Here's a Virus for You");
  });

  it("rejects documents that are not RSS, and malformed XML", () => {
    expect(() => parseRss("<!doctype html><html><body>Challenge</body></html>")).toThrow(
      FeedParseError,
    );
    expect(() => parseRss("")).toThrow(FeedParseError);
    expect(() => parseRss('<rss version="2.0"><channel><item><title>x</title></item>')).toThrow(
      FeedParseError,
    );
    expect(() => parseRss('<rss version="2.0"></rss>')).toThrow(FeedParseError);
  });

  it("ignores DTD entity tricks (no external entities)", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>${rss(
      ["<title>A &xxe; B</title><link>https://thedavidsonian.news/a/</link>"],
    )}`;
    let title = "";
    try {
      title = parseRss(xml).items[0]?.title ?? "";
    } catch (error) {
      expect(error).toBeInstanceOf(FeedParseError);
    }
    expect(title).not.toContain("root:");
  });
});

describe("stale sticky items (> 60 days older than the newest item)", () => {
  it("davidson.edu: the 2023 and 2022 stories pinned on top are skipped", () => {
    const { items, stale } = news("davidson-news", "davidson-news/rss.xml");
    expect(stale).toBe(2);
    expect(items).toHaveLength(8);
    expect(items.some((i) => i.url.includes("/news/2023/") || i.url.includes("/news/2022/"))).toBe(
      false,
    );
    // Newest first, whatever the upstream order.
    const dates = items.map((i) => i.startsAt!.getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it("WildcatSync news: the 2024 post is skipped and the unordered feed comes out newest first", () => {
    const { items, stale } = news("wildcatsync", "wildcatsync/news.rss");
    expect(stale).toBe(1);
    expect(items).toHaveLength(14);
    expect(items.some((i) => i.url.endsWith("/news/308558"))).toBe(false);
    expect(items[0]!.title).toBe("Chart Your Path: The Experiential Learning Program Fair");
    expect(items.every((i) => i.kind === "news" && i.source === "wildcatsync")).toBe(true);
  });

  it("the boundary is exactly 60 days, and undated items are kept", () => {
    const newest = Date.parse("2026-09-28T12:00:00Z");
    const items = [
      { id: "newest", pubDate: new Date(newest) },
      { id: "60d", pubDate: new Date(newest - STALE_NEWS_DAYS * DAY) },
      { id: "61d", pubDate: new Date(newest - (STALE_NEWS_DAYS * DAY + 1)) },
      { id: "undated", pubDate: null },
    ];
    const { kept, stale } = dropStaleItems(items);
    expect(kept.map((i) => i.id).sort()).toEqual(["60d", "newest", "undated"]);
    expect(stale).toBe(1);
  });
});

describe("normalizeNews", () => {
  it("The Davidsonian: every story, text summary, on thedavidsonian.news", () => {
    const { items, stale, skipped } = news("davidsonian", "davidsonian/feed.rss");
    expect([items.length, stale, skipped]).toEqual([10, 0, 0]);
    for (const item of items) {
      expect(new URL(item.url).hostname).toBe("thedavidsonian.news");
      expect(item.summaryText!.length).toBeLessThanOrEqual(500);
      expect(item.summaryText).not.toMatch(/<[a-z]/i);
    }
    expect(items[0]!.externalId).toBe("https://thedavidsonian.news/?p=2790");
  });

  it("davidson.edu summaries are the article teaser, not the byline and photo caption", () => {
    const { items } = news("davidson-news", "davidson-news/rss.xml");
    const basketball = items.find((i) => i.title.startsWith("Holocaust History"))!;
    expect(basketball.summaryText).toBe(
      "Over four days in August, the Davidson College men's basketball team traveled through Berlin to gain a deeper understanding of the Nazis’ rise to power and the roots of the Holocaust.",
    );
    const fellows = items.find((i) => i.title.startsWith("Your Voice, Your Story"))!;
    expect(fellows.summaryText).toMatch(
      /^When you’re sitting in front of a blank Common Application/,
    );
    for (const item of items) expect(item.summaryText ?? "").not.toMatch(/@david|\d{10}/);
    expect(
      summarizeDavidsonNews({
        title: "",
        link: null,
        guid: null,
        pubDate: null,
        description: "<span>x</span>",
        content: null,
        categories: [],
      }),
    ).toBeNull();
  });

  it("skips items without a title or without an allow-listed https link", () => {
    const channel = parseRss(
      rss([
        "<title>Good</title><link>https://thedavidsonian.news/1/good/</link><pubDate>Wed, 16 Sep 2026 14:00:00 +0000</pubDate>",
        "<title>Spam</title><link>https://davidsonian.com/casino/</link>",
        "<title></title><link>https://thedavidsonian.news/2/</link>",
        "<title>Script</title><link>javascript:alert(1)</link>",
      ]),
    );
    const { items, skipped } = normalizeNews(channel, context("davidsonian", "news"));
    expect(items.map((i) => i.title)).toEqual(["Good"]);
    expect(skipped).toBe(3);
  });
});
