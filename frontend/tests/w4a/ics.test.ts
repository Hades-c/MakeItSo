import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { FEED_SOURCES } from "@/server/feeds/config";
import { ICS_LIMITS, parseIcs, unsupportedRecurrence, type IcsOptions } from "@/server/feeds/ics";
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

describe("parseIcs: series published with the series' end as DTEND (WildcatSync)", () => {
  it("turns each session into one evening, drops past sessions, and leaves a lone multi-day item alone", () => {
    const items = byUid(
      ics(
        // Club Swim Practice, as events.ics publishes it: every session ends Oct 22, 9:30 PM ET.
        [
          "UID:swim-1",
          "SUMMARY:Club Swim Practice",
          "DTSTART:20260925T003000Z",
          "DTEND:20261023T013000Z",
        ],
        [
          "UID:swim-2",
          "SUMMARY:Club Swim Practice",
          "DTSTART:20260929T003000Z",
          "DTEND:20261023T013000Z",
        ],
        [
          "UID:swim-3",
          "SUMMARY:Club Swim Practice",
          "DTSTART:20261001T003000Z",
          "DTEND:20261023T013000Z",
        ],
        [
          "UID:swim-4",
          "SUMMARY:Club Swim Practice",
          "DTSTART:20261006T003000Z",
          "DTEND:20261023T013000Z",
        ],
        // A real five-week window, published once.
        [
          "UID:photo",
          "SUMMARY:Returnee Photo Contest Launch",
          "DTSTART:20260921T160000Z",
          "DTEND:20261030T210000Z",
        ],
      ),
    );
    // Sep 24 and Sep 28 sessions ended before today (Sep 30): gone, not "ongoing since Sep 24".
    expect(items.has("swim-1")).toBe(false);
    expect(items.has("swim-2")).toBe(false);
    // Sep 30, 8:30-9:30 PM ET and Oct 5, 8:30-9:30 PM ET.
    expect(iso(items.get("swim-3")!.startsAt)).toBe("2026-10-01T00:30:00.000Z");
    expect(iso(items.get("swim-3")!.endsAt)).toBe("2026-10-01T01:30:00.000Z");
    expect(iso(items.get("swim-4")!.endsAt)).toBe("2026-10-06T01:30:00.000Z");
    expect(items.get("swim-4")!.kind).toBe("event");
    expect(iso(items.get("photo")!.endsAt)).toBe("2026-10-30T21:00:00.000Z");
  });
});

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

describe("parseIcs: RDATE, moved instances and zone-less TZIDs", () => {
  it("an RDATE-only event yields its DTSTART instance, even when every RDATE is past the horizon", () => {
    const within = parse(
      ics([
        "UID:r",
        "SUMMARY:Reading group",
        "DTSTART:20261005T140000Z",
        "DTEND:20261005T150000Z",
        "RDATE:20261012T140000Z,20261019T140000Z",
      ]),
    );
    expect(within.items.map((i) => [i.externalId, iso(i.startsAt), iso(i.endsAt)])).toEqual([
      ["r#2026-10-05T14:00:00.000Z", "2026-10-05T14:00:00.000Z", "2026-10-05T15:00:00.000Z"],
      ["r#2026-10-12T14:00:00.000Z", "2026-10-12T14:00:00.000Z", "2026-10-12T15:00:00.000Z"],
      ["r#2026-10-19T14:00:00.000Z", "2026-10-19T14:00:00.000Z", "2026-10-19T15:00:00.000Z"],
    ]);
    const beyond = parse(
      ics([
        "UID:r",
        "SUMMARY:Reading group",
        "DTSTART:20261005T140000Z",
        "DTEND:20261005T150000Z",
        "RDATE:20261102T140000Z",
      ]),
    );
    expect(beyond.items.map((i) => iso(i.startsAt))).toEqual(["2026-10-05T14:00:00.000Z"]);
    expect([beyond.skipped, beyond.capped]).toEqual([0, 0]);
  });

  it("RDATE values with their own TZID or as a PERIOD, and an EXDATE on DTSTART", () => {
    const { items } = parse(
      ics([
        "UID:mixed",
        "SUMMARY:Mixed",
        "DTSTART;TZID=America/New_York:20261005T100000",
        "DURATION:PT1H",
        "RDATE;TZID=America/Chicago:20261006T090000",
        "RDATE;VALUE=PERIOD:20261007T140000Z/PT2H",
        "EXDATE;TZID=America/New_York:20261005T100000",
      ]),
    );
    expect(items.map((i) => [i.externalId, iso(i.startsAt), iso(i.endsAt)])).toEqual([
      ["mixed#2026-10-06T14:00:00.000Z", "2026-10-06T14:00:00.000Z", "2026-10-06T15:00:00.000Z"],
      ["mixed#2026-10-07T14:00:00.000Z", "2026-10-07T14:00:00.000Z", "2026-10-07T15:00:00.000Z"],
    ]);
  });

  it("an all-day RDATE keeps the series' length in whole days across the DST change", () => {
    const { items } = parse(
      ics([
        "UID:days",
        "SUMMARY:Book sale",
        "DTSTART;VALUE=DATE:20261003",
        "DTEND;VALUE=DATE:20261005",
        "RDATE;VALUE=DATE:20261101",
      ]),
      new Date("2026-10-20T12:00:00-04:00"),
    );
    // Two days from midnight 2026-11-01 (EDT) to midnight 2026-11-03 (EST); the October run is over.
    expect(items.map((i) => [i.externalId, iso(i.startsAt), iso(i.endsAt), i.allDay])).toEqual([
      [
        "days#2026-11-01T04:00:00.000Z",
        "2026-11-01T04:00:00.000Z",
        "2026-11-03T05:00:00.000Z",
        true,
      ],
    ]);
  });

  it("an instance postponed from the past into the window is listed at its new time", () => {
    const { items } = parse(
      ics(
        [
          "UID:p",
          "SUMMARY:Seminar",
          "DTSTART:20260910T140000Z",
          "DTEND:20260910T150000Z",
          "RRULE:FREQ=WEEKLY;COUNT=6",
        ],
        [
          "UID:p",
          "RECURRENCE-ID:20260917T140000Z",
          "SUMMARY:Seminar (postponed to Oct 2)",
          "DTSTART:20261002T140000Z",
          "DTEND:20261002T150000Z",
        ],
      ),
    );
    expect(items.map((i) => [i.externalId, iso(i.startsAt), i.title])).toEqual([
      ["p#2026-10-01T14:00:00.000Z", "2026-10-01T14:00:00.000Z", "Seminar"],
      ["p#2026-09-17T14:00:00.000Z", "2026-10-02T14:00:00.000Z", "Seminar (postponed to Oct 2)"],
      ["p#2026-10-08T14:00:00.000Z", "2026-10-08T14:00:00.000Z", "Seminar"],
      ["p#2026-10-15T14:00:00.000Z", "2026-10-15T14:00:00.000Z", "Seminar"],
    ]);
  });

  it("an instance moved into the next 30 days from beyond them is listed; one moved out is not", () => {
    const { items } = parse(
      ics(
        [
          "UID:m",
          "SUMMARY:Lab",
          "DTSTART;TZID=America/New_York:20261001T100000",
          "DTEND;TZID=America/New_York:20261001T110000",
          "RRULE:FREQ=WEEKLY;COUNT=8",
        ],
        [
          "UID:m",
          "RECURRENCE-ID;TZID=America/New_York:20261112T100000",
          "SUMMARY:Moved in",
          "DTSTART;TZID=America/New_York:20261015T140000",
        ],
        [
          "UID:m",
          "RECURRENCE-ID;TZID=America/New_York:20261008T100000",
          "SUMMARY:Moved out",
          "DTSTART;TZID=America/New_York:20261210T100000",
          "DTEND;TZID=America/New_York:20261210T110000",
        ],
      ),
    );
    expect(items.map((i) => [i.externalId, iso(i.startsAt), iso(i.endsAt), i.title])).toEqual([
      ["m#2026-10-01T14:00:00.000Z", "2026-10-01T14:00:00.000Z", "2026-10-01T15:00:00.000Z", "Lab"],
      ["m#2026-10-15T14:00:00.000Z", "2026-10-15T14:00:00.000Z", "2026-10-15T15:00:00.000Z", "Lab"],
      // No DTEND/DURATION on the override: it keeps the series' one hour.
      [
        "m#2026-11-12T15:00:00.000Z",
        "2026-10-15T18:00:00.000Z",
        "2026-10-15T19:00:00.000Z",
        "Moved in",
      ],
      ["m#2026-10-22T14:00:00.000Z", "2026-10-22T14:00:00.000Z", "2026-10-22T15:00:00.000Z", "Lab"],
      ["m#2026-10-29T14:00:00.000Z", "2026-10-29T14:00:00.000Z", "2026-10-29T15:00:00.000Z", "Lab"],
    ]);
  });

  it("a TZID without a VTIMEZONE matches a UTC EXDATE and a UTC RECURRENCE-ID by instant", () => {
    const now = new Date("2026-10-20T12:00:00-04:00");
    const series = [
      "UID:z",
      "SUMMARY:Weekly",
      "DTSTART;TZID=America/New_York:20261026T100000",
      "DTEND;TZID=America/New_York:20261026T110000",
      "RRULE:FREQ=WEEKLY;COUNT=4",
    ];
    // 2026-11-02 10:00 EST = 15:00Z.
    const excluded = parse(ics([...series, "EXDATE:20261102T150000Z"]), now);
    expect(excluded.items.map((i) => iso(i.startsAt))).toEqual([
      "2026-10-26T14:00:00.000Z",
      "2026-11-09T15:00:00.000Z",
      "2026-11-16T15:00:00.000Z",
    ]);
    const moved = parse(
      ics(series, [
        "UID:z",
        "RECURRENCE-ID:20261102T150000Z",
        "SUMMARY:MovedZ",
        "DTSTART:20261103T190000Z",
        "DTEND:20261103T200000Z",
      ]),
      now,
    );
    expect(moved.items.map((i) => [i.externalId, iso(i.startsAt), i.title])).toEqual([
      ["z#2026-10-26T14:00:00.000Z", "2026-10-26T14:00:00.000Z", "Weekly"],
      ["z#2026-11-02T15:00:00.000Z", "2026-11-03T19:00:00.000Z", "MovedZ"],
      ["z#2026-11-09T15:00:00.000Z", "2026-11-09T15:00:00.000Z", "Weekly"],
      ["z#2026-11-16T15:00:00.000Z", "2026-11-16T15:00:00.000Z", "Weekly"],
    ]);
  });

  it("overrides without their master are separate items (one id per instance)", () => {
    const { items } = parse(
      ics(
        [
          "UID:orphan",
          "RECURRENCE-ID:20261005T140000Z",
          "SUMMARY:A",
          "DTSTART:20261005T150000Z",
          "DURATION:PT1H",
        ],
        [
          "UID:orphan",
          "RECURRENCE-ID:20261012T140000Z",
          "SUMMARY:B",
          "DTSTART:20261012T150000Z",
          "DURATION:PT1H",
        ],
      ),
    );
    expect(items.map((i) => i.externalId)).toEqual([
      "orphan#2026-10-05T14:00:00.000Z",
      "orphan#2026-10-12T14:00:00.000Z",
    ]);
  });
});

describe("parseIcs: expansion limits", () => {
  const spam = (i: number, rule: string, start = "20260930T000000Z") => [
    `UID:spam-${i}`,
    `SUMMARY:Spam ${i}`,
    `DTSTART:${start}`,
    "DURATION:PT1M",
    `RRULE:${rule}`,
  ];

  it("sub-hourly rules are skipped outright (20 FREQ=MINUTELY events: nothing, fast)", () => {
    const started = performance.now();
    const events = Array.from({ length: 20 }, (_, i) =>
      spam(i, i % 2 ? "FREQ=MINUTELY;INTERVAL=5" : "FREQ=SECONDLY", "20200101T000000Z"),
    );
    const result = parse(ics(...events));
    expect(result).toEqual({ items: [], skipped: 20, capped: 0 });
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("rules ical.js would loop on forever are skipped; rare but possible ones still expand", () => {
    const rules = [
      "FREQ=DAILY;BYMONTHDAY=-1",
      "FREQ=DAILY;BYDAY=1MO",
      "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30",
      "FREQ=HOURLY;BYMONTH=2;BYMONTHDAY=29",
      "FREQ=WEEKLY;BYWEEKNO=20",
      "FREQ=DAILY;BYYEARDAY=100",
    ];
    const started = performance.now();
    const result = parse(ics(...rules.map((rule, i) => spam(i, rule))));
    expect(result).toEqual({ items: [], skipped: rules.length, capped: 0 });
    expect(performance.now() - started).toBeLessThan(1_000);

    const fine = parse(
      ics(
        spam(1, "FREQ=DAILY;BYDAY=MO,1TU;COUNT=40", "20260928T140000Z"),
        spam(2, "FREQ=DAILY;BYMONTH=10;BYMONTHDAY=20", "20261001T140000Z"),
        spam(3, "FREQ=MONTHLY;BYDAY=-1FR;COUNT=3", "20261001T140000Z"),
      ),
    );
    expect(fine.skipped).toBe(0);
    expect(fine.items.map((i) => [i.title, iso(i.startsAt)])).toEqual(
      expect.arrayContaining([
        ["Spam 1", "2026-10-05T14:00:00.000Z"],
        ["Spam 2", "2026-10-20T14:00:00.000Z"],
        ["Spam 3", "2026-10-30T14:00:00.000Z"],
      ]),
    );
  });

  it("keeps at most 100 instances per event (the soonest) and counts the event as capped", () => {
    const { items, skipped, capped } = parse(ics(spam(1, "FREQ=HOURLY"), spam(2, "FREQ=DAILY")));
    const hourly = items.filter((i) => i.title === "Spam 1");
    expect(hourly).toHaveLength(ICS_LIMITS.instancesPerEvent);
    // From midnight ET today (the 00:00-03:00Z instances ended yesterday in New York), 100 hours.
    expect(iso(hourly[0]!.startsAt)).toBe("2026-09-30T04:00:00.000Z");
    expect(iso(hourly.at(-1)!.startsAt)).toBe("2026-10-04T07:00:00.000Z");
    expect(items.filter((i) => i.title === "Spam 2")).toHaveLength(30);
    expect([skipped, capped]).toEqual([0, 1]);
  });

  it("an event whose series starts too far back to reach today within its step budget is capped", () => {
    const { items, capped } = parse(
      ics(spam(1, "FREQ=DAILY", "20230101T140000Z"), spam(2, "FREQ=WEEKLY", "20230102T140000Z")),
      undefined,
      { limits: { stepsPerEvent: 1_000 } },
    );
    // 2023-01-01 → today is ~1,370 daily steps (> 1,000); weekly is ~200.
    expect(new Set(items.map((i) => i.title))).toEqual(new Set(["Spam 2"]));
    expect(capped).toBe(1);
  });

  it("the document budget stops expanding recurring events but keeps one-off events", () => {
    const text = ics(
      spam(1, "FREQ=DAILY"),
      ["UID:once", "SUMMARY:Once", "DTSTART:20261001T140000Z", "DTEND:20261001T150000Z"],
      spam(2, "FREQ=WEEKLY"),
    );
    const byTime = parse(text, undefined, { limits: { expansionMs: 0 } });
    expect(byTime.items.map((i) => i.title)).toEqual(["Once"]);
    expect(byTime.capped).toBe(2);
    const bySteps = parse(text, undefined, { limits: { stepsPerDocument: 10 } });
    expect(bySteps.items.map((i) => i.title)).toContain("Once");
    expect(bySteps.capped).toBeGreaterThanOrEqual(1);
  });

  it("caps the events read and the items returned per document", () => {
    const events = Array.from({ length: 6 }, (_, i) => [
      `UID:e${i}`,
      `SUMMARY:E${i}`,
      `DTSTART:2026100${i + 1}T140000Z`,
      "DURATION:PT1H",
    ]);
    expect(parse(ics(...events), undefined, { limits: { events: 4 } })).toMatchObject({
      capped: 2,
    });
    const limited = parse(ics(...events), undefined, { limits: { items: 3 } });
    expect(limited.items.map((i) => i.title)).toEqual(["E0", "E1", "E2"]);
    expect(limited.capped).toBe(3);
  });

  it("unsupportedRecurrence explains the rules it refuses", () => {
    const rule = (value: string) => ICAL.Recur.fromString(value);
    expect(unsupportedRecurrence(rule("FREQ=MINUTELY"))).toBe("FREQ=MINUTELY");
    expect(unsupportedRecurrence(rule("FREQ=DAILY;BYDAY=1MO,-1FR"))).toMatch(/^BYDAY=/);
    expect(unsupportedRecurrence(rule("FREQ=DAILY;BYMONTH=4;BYMONTHDAY=31"))).toMatch(
      /never matches/,
    );
    expect(unsupportedRecurrence(rule("FREQ=DAILY;BYMONTH=4,5;BYMONTHDAY=31"))).toBeNull();
    expect(unsupportedRecurrence(rule("FREQ=WEEKLY;BYDAY=1MO;BYMONTH=3"))).toBeNull();
    expect(unsupportedRecurrence(rule("FREQ=YEARLY;BYWEEKNO=20"))).toBeNull();
    expect(unsupportedRecurrence(rule("FREQ=HOURLY;BYDAY=SA;BYHOUR=9,17"))).toBeNull();
  });
});

describe("parseIcs: hostile descriptions", () => {
  it("a 120 KB DESCRIPTION of 'a<b ' parses quickly (only the start is read, in linear time)", () => {
    const started = performance.now();
    const { items } = parse(
      ics([
        "UID:long",
        "SUMMARY:Long",
        `DESCRIPTION:${"a<b ".repeat(30_000)}`,
        "DTSTART:20261001T140000Z",
        "DTEND:20261001T150000Z",
      ]),
    );
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(items[0]!.summaryText!.length).toBeLessThanOrEqual(500);
  });
});

describe("parseIcs: description text is decoded once", () => {
  it("escaped markup stays literal and query strings keep their '&name=' parameters", () => {
    const url =
      "https://example.edu/f?id=5&section=2&copy=1&times=3&para=x&reg=4&region=us&notify=1";
    const { items } = parse(
      ics([
        "UID:d",
        "SUMMARY:Pizza &not pasta",
        `DESCRIPTION:Use &amp;lt;b&amp;gt; for bold. Form: ${url}`,
        "DTSTART:20261001T140000Z",
        "DTEND:20261001T150000Z",
      ]),
    );
    expect(items[0]!.title).toBe("Pizza &not pasta");
    expect(items[0]!.summaryText).toBe(`Use &lt;b&gt; for bold. Form: ${url}`);
  });
});
