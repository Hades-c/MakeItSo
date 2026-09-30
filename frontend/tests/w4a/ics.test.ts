import { describe, expect, it } from "vitest";
import { FEED_SOURCES } from "@/server/feeds/config";
import { parseIcs, type IcsOptions } from "@/server/feeds/ics";
import { hurtHubExternalId, normalizeTribeEvents } from "@/server/feeds/tribe";
import { FeedParseError } from "@/server/feeds/types";
import { context, fixture, FIXTURE_NOW, ics } from "./helpers";

const WILDCAT_EVENTS = "https://wildcatsync.davidson.edu/events";

function options(now: Date = FIXTURE_NOW, extra: Partial<IcsOptions> = {}): IcsOptions {
  return { ...context("wildcatsync", "events", now), fallbackUrl: WILDCAT_EVENTS, ...extra };
}

function parse(text: string, now?: Date, extra?: Partial<IcsOptions>) {
  return parseIcs(text, options(now, extra));
}

function byUid(text: string, now?: Date) {
  return new Map(parse(text, now).items.map((item) => [item.externalId, item]));
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

describe("parseIcs: times", () => {
  it("Z, TZID (without VTIMEZONE), floating, Windows and other-zone times become instants", () => {
    const items = byUid(
      ics(
        ["UID:z", "SUMMARY:Z", "DTSTART:20261002T140000Z", "DTEND:20261002T150000Z"],
        [
          "UID:tz",
          "SUMMARY:TZID",
          "DTSTART;TZID=America/New_York:20261002T100000",
          "DTEND;TZID=America/New_York:20261002T110000",
        ],
        ["UID:float", "SUMMARY:Floating", "DTSTART:20261002T100000", "DTEND:20261002T110000"],
        [
          "UID:win",
          "SUMMARY:Outlook",
          "DTSTART;TZID=Eastern Standard Time:20261203T100000",
          "DURATION:PT1H",
        ],
        [
          "UID:la",
          "SUMMARY:LA",
          "DTSTART;TZID=America/Los_Angeles:20261002T070000",
          "DURATION:PT1H",
        ],
      ),
    );
    expect(iso(items.get("z")!.startsAt)).toBe("2026-10-02T14:00:00.000Z");
    expect(iso(items.get("tz")!.startsAt)).toBe("2026-10-02T14:00:00.000Z");
    expect(iso(items.get("tz")!.endsAt)).toBe("2026-10-02T15:00:00.000Z");
    expect(iso(items.get("float")!.startsAt)).toBe("2026-10-02T14:00:00.000Z");
    expect(iso(items.get("win")!.startsAt)).toBe("2026-12-03T15:00:00.000Z");
    expect(iso(items.get("win")!.endsAt)).toBe("2026-12-03T16:00:00.000Z");
    expect(iso(items.get("la")!.startsAt)).toBe("2026-10-02T14:00:00.000Z");
    for (const item of items.values()) expect(item.allDay).toBe(false);
  });

  it("uses the VTIMEZONE-backed zone of the Hurt Hub export (6:45 pm EDT → 22:45Z)", () => {
    const { items, skipped } = parseIcs(fixture("hurt-hub/events.ics"), {
      ...context("hurt-hub"),
      fallbackUrl: "https://hurthub.davidson.edu/events/",
      externalIdFor: hurtHubExternalId,
    });
    expect(skipped).toBe(0);
    expect(items).toHaveLength(9);
    const lean = items.find((item) => item.externalId === "hurt-hub:1862")!;
    expect(iso(lean.startsAt)).toBe("2026-09-23T22:45:00.000Z");
    // Ends 2026-11-11 8:15 pm EST, after DST ended.
    expect(iso(lean.endsAt)).toBe("2026-11-12T01:15:00.000Z");
    expect(lean.location).toBe(
      "The Hurt Hub at Davidson College, 210 Delburg Street, Davidson, NC 28036, Davidson, NC, 28036, US",
    );
  });

  it("the Hurt Hub iCal and Tribe exports produce the same ids and times", () => {
    const fromIcs = parseIcs(fixture("hurt-hub/events.ics"), {
      ...context("hurt-hub"),
      fallbackUrl: "https://hurthub.davidson.edu/events/",
      externalIdFor: hurtHubExternalId,
    }).items;
    const tribe = JSON.parse(fixture("hurt-hub/tribe-events.json")) as { events: unknown[] };
    const fromTribe = normalizeTribeEvents(tribe.events, {
      ...context("hurt-hub"),
      fallbackUrl: "https://hurthub.davidson.edu/events/",
    }).items;
    const summarize = (items: typeof fromIcs) =>
      items.map((i) => [i.externalId, iso(i.startsAt), iso(i.endsAt), i.url]).sort();
    expect(summarize(fromTribe)).toEqual(summarize(fromIcs));
  });
});

describe("parseIcs: all-day, deadlines, DST", () => {
  it("VALUE=DATE is all-day from midnight ET; DTEND is exclusive; no DTEND means one day", () => {
    const items = byUid(
      ics(
        [
          "UID:two",
          "SUMMARY:Fall Break",
          "DTSTART;VALUE=DATE:20261010",
          "DTEND;VALUE=DATE:20261012",
        ],
        ["UID:one", "SUMMARY:One day", "DTSTART;VALUE=DATE:20261005"],
      ),
    );
    const two = items.get("two")!;
    expect(two).toMatchObject({ allDay: true, kind: "event" });
    expect(iso(two.startsAt)).toBe("2026-10-10T04:00:00.000Z");
    expect(iso(two.endsAt)).toBe("2026-10-12T04:00:00.000Z");
    expect(iso(items.get("one")!.endsAt)).toBe("2026-10-06T04:00:00.000Z");
  });

  it("an all-day event on 2026-11-01 (DST ends) spans 25 hours; on 2027-03-14 (DST starts) 23 hours", () => {
    const nov = byUid(ics(["UID:d", "SUMMARY:DST end", "DTSTART;VALUE=DATE:20261101"])).get("d")!;
    expect(iso(nov.startsAt)).toBe("2026-11-01T04:00:00.000Z");
    expect(iso(nov.endsAt)).toBe("2026-11-02T05:00:00.000Z");
    const march = byUid(
      ics(["UID:d", "SUMMARY:DST start", "DTSTART;VALUE=DATE:20270314"]),
      new Date("2027-03-10T12:00:00-05:00"),
    ).get("d")!;
    expect(iso(march.startsAt)).toBe("2027-03-14T05:00:00.000Z");
    expect(iso(march.endsAt)).toBe("2027-03-15T04:00:00.000Z");
  });

  it("events of one minute or less are deadlines (due at startsAt); longer ones are events", () => {
    const items = byUid(
      ics(
        ["UID:one", "SUMMARY:Due", "DTSTART:20261001T190000Z", "DTEND:20261001T190100Z"],
        ["UID:zero", "SUMMARY:Point", "DTSTART:20261001T200000Z"],
        ["UID:two", "SUMMARY:Short", "DTSTART:20261001T190000Z", "DTEND:20261001T190200Z"],
      ),
    );
    expect(items.get("one")!.kind).toBe("deadline");
    expect(iso(items.get("one")!.startsAt)).toBe("2026-10-01T19:00:00.000Z");
    expect(items.get("zero")!.kind).toBe("deadline");
    expect(items.get("two")!.kind).toBe("event");
  });

  it("the WildcatSync Watson deadline (19:00–19:01Z) is a deadline at 3 pm EDT today", () => {
    const { items, skipped } = parseIcs(fixture("wildcatsync/events.ics"), {
      ...options(),
      cleanDescription: FEED_SOURCES.wildcatsync.channels[0]!.cleanDescription,
    });
    expect(skipped).toBe(0);
    expect(items).toHaveLength(15);
    const watson = items.find((item) => item.externalId.endsWith("/event/12460064"))!;
    expect(watson).toMatchObject({
      kind: "deadline",
      title: "Watson Fellowship Nomination Application Deadline: 9/30/2026",
      url: "https://wildcatsync.davidson.edu/event/12460064",
      location: "Online",
    });
    expect(iso(watson.startsAt)).toBe("2026-09-30T19:00:00.000Z");
    // Escapes (\, \n) are decoded; the "Additional Information" line pointing at the item URL is dropped.
    expect(watson.summaryText).toContain("$40,000 grant");
    expect(watson.summaryText).not.toContain("Additional Information");
    // A long-running event that started in July and ends tomorrow is still listed.
    const rhodes = items.find((item) => item.externalId.endsWith("/event/12490505"))!;
    expect(iso(rhodes.startsAt)).toBe("2026-07-23T16:00:00.000Z");
    // Folded lines are unfolded (the location continues on the next line upstream).
    expect(
      items.some((item) => item.location?.startsWith("Mauzé Family Terrace behind the Wall")),
    ).toBe(true);
    expect(
      items.every((item) => item.url.startsWith("https://wildcatsync.davidson.edu/event/")),
    ).toBe(true);
  });
});

describe("parseIcs: recurrence (next 30 days)", () => {
  it("a weekly 10:00 ET event keeps its wall-clock time across the 2026-11-01 DST change", () => {
    const now = new Date("2026-10-20T12:00:00-04:00");
    const { items } = parse(
      ics([
        "UID:weekly",
        "SUMMARY:Weekly seminar",
        "DTSTART;TZID=America/New_York:20261013T100000",
        "DTEND;TZID=America/New_York:20261013T113000",
        "RRULE:FREQ=WEEKLY",
      ]),
      now,
    );
    // 10-13 ended before today; 11-24 is beyond now + 30 days.
    expect(items.map((i) => iso(i.startsAt))).toEqual([
      "2026-10-20T14:00:00.000Z",
      "2026-10-27T14:00:00.000Z",
      "2026-11-03T15:00:00.000Z",
      "2026-11-10T15:00:00.000Z",
      "2026-11-17T15:00:00.000Z",
    ]);
    expect(items.map((i) => iso(i.endsAt))[2]).toBe("2026-11-03T16:30:00.000Z");
    expect(new Set(items.map((i) => i.externalId)).size).toBe(5);
    expect(items[2]!.externalId).toBe("weekly#2026-11-03T15:00:00.000Z");
  });

  it("a UTC-anchored daily rule keeps its UTC time (RFC 5545), so it moves an hour in ET", () => {
    const now = new Date("2026-10-30T12:00:00-04:00");
    const { items } = parse(
      ics([
        "UID:utc",
        "SUMMARY:UTC daily",
        "DTSTART:20261031T140000Z",
        "DURATION:PT30M",
        "RRULE:FREQ=DAILY;COUNT=3",
      ]),
      now,
    );
    expect(items.map((i) => iso(i.startsAt))).toEqual([
      "2026-10-31T14:00:00.000Z",
      "2026-11-01T14:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
    ]);
  });

  it("DST starts 2027-03-14: Monday 9:00 ET is 14:00Z before and 13:00Z after", () => {
    const now = new Date("2027-03-05T12:00:00-05:00");
    const { items } = parse(
      ics([
        "UID:mon",
        "SUMMARY:Monday lab",
        "DTSTART;TZID=America/New_York:20270308T090000",
        "DTEND;TZID=America/New_York:20270308T100000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3",
      ]),
      now,
    );
    expect(items.map((i) => iso(i.startsAt))).toEqual([
      "2027-03-08T14:00:00.000Z",
      "2027-03-15T13:00:00.000Z",
      "2027-03-22T13:00:00.000Z",
    ]);
  });

  it("expands an open-ended rule only for the next 30 days", () => {
    const { items } = parse(
      ics([
        "UID:daily",
        "SUMMARY:Office hours",
        "DTSTART;TZID=America/New_York:20260901T100000",
        "DTEND;TZID=America/New_York:20260901T110000",
        "RRULE:FREQ=DAILY",
      ]),
    );
    // Today (already over, but today) through 2026-10-30 10:00, before now + 30 days (10-30 noon).
    expect(items).toHaveLength(31);
    expect(iso(items[0]!.startsAt)).toBe("2026-09-30T14:00:00.000Z");
    expect(iso(items.at(-1)!.startsAt)).toBe("2026-10-30T14:00:00.000Z");
  });

  it("honours EXDATE and RECURRENCE-ID overrides (moved keeps its id, cancelled is dropped)", () => {
    const text = ics(
      [
        "UID:club",
        "SUMMARY:Book club",
        "DTSTART;TZID=America/New_York:20261005T190000",
        "DTEND;TZID=America/New_York:20261005T200000",
        "RRULE:FREQ=WEEKLY;COUNT=4",
        "EXDATE;TZID=America/New_York:20261012T190000",
      ],
      [
        "UID:club",
        "RECURRENCE-ID;TZID=America/New_York:20261019T190000",
        "SUMMARY:Book club (moved to the library)",
        "DTSTART;TZID=America/New_York:20261020T180000",
        "DTEND;TZID=America/New_York:20261020T190000",
        "LOCATION:Library",
      ],
      [
        "UID:club",
        "RECURRENCE-ID;TZID=America/New_York:20261026T190000",
        "STATUS:CANCELLED",
        "SUMMARY:Book club",
        "DTSTART;TZID=America/New_York:20261026T190000",
        "DTEND;TZID=America/New_York:20261026T200000",
      ],
    );
    const { items } = parse(text);
    expect(items.map((i) => [i.externalId, iso(i.startsAt), i.title, i.location])).toEqual([
      ["club#2026-10-05T23:00:00.000Z", "2026-10-05T23:00:00.000Z", "Book club", null],
      [
        "club#2026-10-19T23:00:00.000Z",
        "2026-10-20T22:00:00.000Z",
        "Book club (moved to the library)",
        "Library",
      ],
    ]);
  });
});

describe("parseIcs: filtering, text and links", () => {
  it("skips cancelled, private and finished events and counts unreadable ones", () => {
    const { items, skipped } = parse(
      ics(
        ["UID:ok", "SUMMARY:Kept", "DTSTART:20261001T140000Z", "DTEND:20261001T150000Z"],
        ["UID:cancel", "SUMMARY:Gone", "STATUS:CANCELLED", "DTSTART:20261001T140000Z"],
        ["UID:private", "SUMMARY:Secret", "CLASS:PRIVATE", "DTSTART:20261001T140000Z"],
        ["UID:past", "SUMMARY:Yesterday", "DTSTART:20260929T140000Z", "DTEND:20260929T150000Z"],
        [
          "UID:earlier",
          "SUMMARY:This morning",
          "DTSTART:20260930T130000Z",
          "DTEND:20260930T140000Z",
        ],
        ["UID:notitle", "DTSTART:20261001T140000Z"],
        ["UID:bad", "SUMMARY:Bad date", "DTSTART:garbage"],
      ),
    );
    expect(items.map((i) => i.externalId).sort()).toEqual(["earlier", "ok"]);
    expect(skipped).toBe(2);
  });

  it("titles and descriptions become plain text; long values are cut", () => {
    const { items } = parse(
      ics([
        "UID:html",
        `SUMMARY:<b>Tom &amp; Jerry</b> ${"x".repeat(400)}`,
        "DESCRIPTION:<p>Free <em>pizza</em> &amp; games</p><script>alert(1)</script>",
        "LOCATION:Union\\, Room 1",
        "DTSTART:20261001T140000Z",
        "DTEND:20261001T150000Z",
      ]),
    );
    const item = items[0]!;
    expect(item.title.startsWith("Tom & Jerry x")).toBe(true);
    expect(item.title.length).toBeLessThanOrEqual(300);
    expect(item.summaryText).toBe("Free pizza & games");
    expect(item.location).toBe("Union, Room 1");
  });

  it("links: URL on the allow-list, else the UID if it is one, else the source's events page", () => {
    const items = byUid(
      ics(
        [
          "UID:a",
          "SUMMARY:A",
          "URL:http://wildcatsync.davidson.edu/event/1",
          "DTSTART:20261001T140000Z",
        ],
        ["UID:https://wildcatsync.davidson.edu/event/2", "SUMMARY:B", "DTSTART:20261001T140000Z"],
        ["UID:c", "SUMMARY:C", "URL:https://phishing.example/event/3", "DTSTART:20261001T140000Z"],
        ["UID:d", "SUMMARY:D", "URL:javascript:alert(1)", "DTSTART:20261001T140000Z"],
      ),
    );
    expect(items.get("a")!.url).toBe("https://wildcatsync.davidson.edu/event/1");
    expect(items.get("https://wildcatsync.davidson.edu/event/2")!.url).toBe(
      "https://wildcatsync.davidson.edu/event/2",
    );
    expect(items.get("c")!.url).toBe(WILDCAT_EVENTS);
    expect(items.get("d")!.url).toBe(WILDCAT_EVENTS);
  });

  it("LibCal: past events are dropped, instances sharing one page stay separate", () => {
    const { items } = parseIcs(fixture("library/events.ics"), {
      ...context("library"),
      fallbackUrl: "https://www.davidson.edu/library",
    });
    expect(items).toHaveLength(10);
    expect(items.every((i) => i.startsAt!.getTime() >= Date.parse("2026-09-30T04:00:00Z"))).toBe(
      true,
    );
    const bookClub = items.filter(
      (i) => i.url === "https://davidson.libcal.com/calendar/events/silent-book-club",
    );
    expect(bookClub.length).toBeGreaterThanOrEqual(3);
    expect(new Set(bookClub.map((i) => i.externalId)).size).toBe(bookClub.length);
  });

  it("anything that is not a complete iCalendar document is a FeedParseError", () => {
    expect(() => parse("<!doctype html><html>Access denied</html>")).toThrow(FeedParseError);
    expect(() => parse("")).toThrow(FeedParseError);
    expect(() => parse("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\n")).toThrow(FeedParseError);
    expect(parse("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n").items).toEqual([]);
  });
});
