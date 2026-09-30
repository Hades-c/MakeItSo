import { describe, expect, it } from "vitest";
import { extractDigestEntries, normalizeDigest, parseDigestDate } from "@/server/feeds/digest";
import { parseRss } from "@/server/feeds/rss";
import { context, fixture, rss, TZ } from "./helpers";

describe("Events Digest dates", () => {
  it.each([
    ["Sep 26, 2026 10:00 am", "2026-09-26T14:00:00.000Z", false],
    ["Oct 05, 2026 05:00 pm", "2026-10-05T21:00:00.000Z", false],
    ["Nov 03, 2026 12:00 pm", "2026-11-03T17:00:00.000Z", false],
    ["Nov 01, 2026 12:30 am", "2026-11-01T04:30:00.000Z", false],
    ["October 5, 2026 at 5 p.m.", "2026-10-05T21:00:00.000Z", false],
    ["Sept 9, 2026", "2026-09-09T04:00:00.000Z", true],
    ["Dec 12, 2026", "2026-12-12T05:00:00.000Z", true],
  ])("%s → %s", (text, instant, allDay) => {
    expect(parseDigestDate(text, TZ)).toEqual({ startsAt: new Date(instant), allDay });
  });

  it("no date → null", () => {
    expect(parseDigestDate("Coming soon", TZ)).toBeNull();
    expect(parseDigestDate("Feb 30, 2026 13:00 pm", TZ)).toBeNull();
  });
});

describe("normalizeDigest", () => {
  const channel = parseRss(fixture("events-digest/feed.rss"));

  it("splits the newest issue into events on Davidson's calendar pages", () => {
    const { items, stale } = normalizeDigest(channel, context("events-digest"));
    expect(stale).toBe(5); // the April/May issues are more than 60 days older than 2026-09-25
    expect(items).toHaveLength(18);
    expect(items.every((i) => i.kind === "event" && i.channel === "events")).toBe(true);
    expect(items.every((i) => i.url.startsWith("https://www.davidson.edu/events/booking/"))).toBe(
      true,
    );
    const cinema = items.find((i) => i.title.startsWith("Global Cinema Classics"))!;
    expect(cinema.startsAt?.toISOString()).toBe("2026-10-05T21:00:00.000Z");
    expect(cinema.endsAt).toBeNull();
    // Events already over (Sep 26, Sep 29) are not stored.
    expect(items.every((i) => i.startsAt!.getTime() >= Date.parse("2026-09-30T04:00:00Z"))).toBe(
      true,
    );
    expect(new Set(items.map((i) => i.externalId)).size).toBe(items.length);
    expect(items.map((i) => i.title)).toContain("Q&A with visiting poet, David Gate");
  });

  it("the same event listed in several issues is kept once", () => {
    const html = (title: string) =>
      `<![CDATA[<h3><a href="https://www.davidson.edu/events/booking/abc"><span>${title}</span></a></h3><strong><em>Oct 20, 2026 07:00 pm</em></strong>]]>`;
    const doubled = parseRss(
      rss([
        `<title>Issue 2</title><link>https://us6.campaign-archive.com/?u=a&amp;id=2</link><pubDate>Fri, 02 Oct 2026 15:00:00 +0000</pubDate><description>${html("Concert")}</description>`,
        `<title>Issue 1</title><link>https://us6.campaign-archive.com/?u=a&amp;id=1</link><pubDate>Fri, 25 Sep 2026 15:00:00 +0000</pubDate><description>${html("Concert (old title)")}</description>`,
      ]),
    );
    const { items } = normalizeDigest(doubled, context("events-digest"));
    expect(items.map((i) => i.title)).toEqual(["Concert"]);
  });

  it("an issue whose layout yields no events is kept as a news item linking to the issue", () => {
    const changed = parseRss(
      rss([
        "<title>Upcoming Events at Davidson College</title><link>https://us6.campaign-archive.com/?u=a&amp;id=9</link><pubDate>Fri, 25 Sep 2026 15:00:00 +0000</pubDate><description><![CDATA[<div>New layout</div>]]></description>",
      ]),
    );
    const { items } = normalizeDigest(changed, context("events-digest"));
    expect(items).toEqual([
      expect.objectContaining({
        kind: "news",
        channel: "issues",
        url: "https://us6.campaign-archive.com/?u=a&id=9",
        startsAt: new Date("2026-09-25T15:00:00Z"),
      }),
    ]);
  });

  it("entries with off-list links fall back to the issue link; entries without a date are skipped", () => {
    const entries = extractDigestEntries(
      '<h3><a href="https://evil.example/x">Bad link</a></h3><em>Oct 20, 2026 07:00 pm</em><h3>No date</h3><p>TBA</p>',
      TZ,
    );
    expect(entries.map((e) => [e.title, e.href, e.date?.startsAt.toISOString() ?? null])).toEqual([
      ["Bad link", "https://evil.example/x", "2026-10-20T23:00:00.000Z"],
      ["No date", null, null],
    ]);
    const channel2 = parseRss(
      rss([
        `<title>I</title><link>https://us6.campaign-archive.com/?u=a&amp;id=3</link><pubDate>Fri, 25 Sep 2026 15:00:00 +0000</pubDate><description><![CDATA[<h3><a href="https://evil.example/x">Bad link</a></h3><em>Oct 20, 2026 07:00 pm</em><h3>No date</h3>]]></description>`,
      ]),
    );
    const { items, skipped } = normalizeDigest(channel2, context("events-digest"));
    expect(items.map((i) => [i.title, i.url])).toEqual([
      ["Bad link", "https://us6.campaign-archive.com/?u=a&id=3"],
    ]);
    expect(skipped).toBe(1);
  });
});
