import { describe, expect, it } from "vitest";
import {
  eventTimeLabel,
  groupEvents,
  isDeadlineItem,
  lastDay,
  startDay,
  windowEndLabel,
} from "@/app/(hub)/events/_lib/present";
import type { FeedItem } from "@/lib/types/feeds";

const TZ = "America/New_York";
const NOW = new Date("2026-09-30T12:00:00-04:00");
const OPTIONS = { now: NOW, timeZone: TZ };

let counter = 0;
function item(fields: Partial<FeedItem>): FeedItem {
  counter += 1;
  return {
    id: `item-${counter}`,
    source: "wildcatsync",
    kind: "event",
    title: `Item ${counter}`,
    url: "https://wildcatsync.davidson.edu/event/1",
    startsAt: null,
    endsAt: null,
    allDay: false,
    location: null,
    summaryText: null,
    fetchedAt: "2026-09-30T16:00:00.000Z",
    ...fields,
  };
}

describe("deadlines and days", () => {
  it("treats kind deadline and one-minute timed items as deadlines", () => {
    expect(isDeadlineItem(item({ kind: "deadline", startsAt: "2026-09-30T19:00:00Z" }))).toBe(true);
    expect(
      isDeadlineItem(item({ startsAt: "2026-09-30T19:00:00Z", endsAt: "2026-09-30T19:01:00Z" })),
    ).toBe(true);
    expect(
      isDeadlineItem(item({ startsAt: "2026-09-30T19:00:00Z", endsAt: "2026-09-30T19:02:00Z" })),
    ).toBe(false);
    expect(isDeadlineItem(item({ startsAt: "2026-09-30T19:00:00Z" }))).toBe(false);
    expect(
      isDeadlineItem(
        item({ allDay: true, startsAt: "2026-09-30T04:00:00Z", endsAt: "2026-09-30T04:00:00Z" }),
      ),
    ).toBe(false);
  });

  it("reads the start and last day in ET; midnight ends belong to the day before", () => {
    const late = item({ startsAt: "2026-10-01T03:30:00Z", endsAt: "2026-10-01T04:00:00Z" });
    expect(startDay(late, TZ)).toBe("2026-09-30");
    expect(lastDay(late, TZ)).toBe("2026-09-30");
    const allDay = item({
      allDay: true,
      startsAt: "2026-10-02T04:00:00Z",
      endsAt: "2026-10-04T04:00:00Z",
    });
    expect(lastDay(allDay, TZ)).toBe("2026-10-03");
    expect(lastDay(item({ startsAt: "2026-10-02T04:00:00Z" }), TZ)).toBeNull();
    expect(startDay(item({}), TZ)).toBeNull();
  });
});

describe("groupEvents", () => {
  it("puts earlier-started items in Ongoing, then one group per ET day", () => {
    const rhodes = item({ startsAt: "2026-07-23T16:00:00Z", endsAt: "2026-10-01T16:00:00Z" });
    const today = item({ startsAt: "2026-09-30T19:00:00Z", endsAt: "2026-09-30T21:00:00Z" });
    const lateToday = item({ startsAt: "2026-10-01T02:00:00Z", endsAt: "2026-10-01T03:30:00Z" });
    const tomorrow = item({ startsAt: "2026-10-01T15:00:00Z", endsAt: "2026-10-01T16:00:00Z" });
    const friday = item({ startsAt: "2026-10-02T20:00:00Z", endsAt: "2026-10-05T00:00:00Z" });
    const undated = item({ kind: "news" });
    const groups = groupEvents([rhodes, today, lateToday, tomorrow, friday, undated], OPTIONS);
    expect(groups.map((g) => [g.key, g.kind, g.title, g.detail, g.items.map((i) => i.id)])).toEqual(
      [
        ["ongoing", "ongoing", "Ongoing", "Started before today", [rhodes.id]],
        ["2026-09-30", "day", "Today", "Wednesday, September 30", [today.id, lateToday.id]],
        ["2026-10-01", "day", "Tomorrow", "Thursday, October 1", [tomorrow.id]],
        ["2026-10-02", "day", "Friday, October 2", null, [friday.id]],
      ],
    );
  });

  it("has no Ongoing group when nothing started earlier, and nothing for no items", () => {
    expect(groupEvents([], OPTIONS)).toEqual([]);
    const groups = groupEvents([item({ startsAt: "2026-10-06T14:30:00Z" })], OPTIONS);
    expect(groups.map((g) => g.title)).toEqual(["Tuesday, October 6"]);
  });

  it("follows the campus calendar across the DST change", () => {
    // 11:30 PM EST on Sunday Nov 1 is Nov 2 in UTC.
    const groups = groupEvents([item({ startsAt: "2026-11-02T04:30:00Z" })], {
      now: new Date("2026-11-01T12:00:00-05:00"),
      timeZone: TZ,
    });
    expect(groups.map((g) => [g.key, g.title])).toEqual([["2026-11-01", "Today"]]);
  });
});

describe("groupEvents: one ongoing entry per series", () => {
  it("collapses ongoing items that share a title and an end", () => {
    const end = "2026-10-23T01:30:00.000Z";
    const swim = (startsAt: string) => item({ title: "Club Swim Practice", startsAt, endsAt: end });
    const groups = groupEvents(
      [
        swim("2026-09-25T00:30:00Z"),
        swim("2026-09-29T00:30:00Z"),
        item({ title: "club swim practice", startsAt: "2026-09-27T00:30:00Z", endsAt: end }),
        item({ title: "Other", startsAt: "2026-09-27T00:30:00Z", endsAt: end }),
      ],
      OPTIONS,
    );
    const ongoing = groups.find((g) => g.kind === "ongoing")!;
    expect(ongoing.items.map((i) => [i.title, i.startsAt])).toEqual([
      ["Club Swim Practice", "2026-09-25T00:30:00Z"],
      ["Other", "2026-09-27T00:30:00Z"],
    ]);
  });
});

describe("eventTimeLabel", () => {
  const label = (fields: Partial<FeedItem>) => eventTimeLabel(item(fields), OPTIONS);

  it("renders timed, open-ended and multi-day events", () => {
    expect(label({ startsAt: "2026-09-30T19:00:00Z", endsAt: "2026-09-30T21:00:00Z" })).toBe(
      "3:00 PM – 5:00 PM",
    );
    expect(label({ startsAt: "2026-10-05T21:00:00Z" })).toBe("5:00 PM");
    expect(label({ startsAt: "2026-09-30T23:00:00Z", endsAt: "2026-10-01T00:00:00Z" })).toBe(
      "7:00 PM – 8:00 PM",
    );
    // Ends at midnight: still one day.
    expect(label({ startsAt: "2026-10-01T02:00:00Z", endsAt: "2026-10-01T04:00:00Z" })).toBe(
      "10:00 PM – 12:00 AM",
    );
    expect(label({ startsAt: "2026-10-02T20:00:00Z", endsAt: "2026-10-05T00:00:00Z" })).toBe(
      "Oct 2, 4:00 PM – Oct 4, 8:00 PM",
    );
  });

  it("renders deadlines and all-day items", () => {
    expect(
      label({ kind: "deadline", startsAt: "2026-09-30T19:00:00Z", endsAt: "2026-09-30T19:01:00Z" }),
    ).toBe("Due 3:00 PM");
    expect(label({ startsAt: "2026-10-01T03:59:00Z", endsAt: "2026-10-01T03:59:00Z" })).toBe(
      "Due 11:59 PM",
    );
    expect(
      label({ allDay: true, startsAt: "2026-10-02T04:00:00Z", endsAt: "2026-10-03T04:00:00Z" }),
    ).toBe("All day");
    expect(
      label({ allDay: true, startsAt: "2026-10-02T04:00:00Z", endsAt: "2026-10-05T04:00:00Z" }),
    ).toBe("All day, through Oct 4");
  });

  it("says since when and until when for ongoing items", () => {
    expect(label({ startsAt: "2026-07-23T16:00:00Z", endsAt: "2026-10-01T16:00:00Z" })).toBe(
      "Since Jul 23 · until Oct 1, 12:00 PM",
    );
    expect(label({ startsAt: "2026-09-23T22:45:00Z", endsAt: "2026-09-30T20:00:00Z" })).toBe(
      "Since Sep 23 · until 4:00 PM today",
    );
    expect(
      label({ allDay: true, startsAt: "2026-09-28T04:00:00Z", endsAt: "2026-10-01T04:00:00Z" }),
    ).toBe("Since Sep 28 · through today");
    expect(
      label({ allDay: true, startsAt: "2026-09-28T04:00:00Z", endsAt: "2026-10-03T04:00:00Z" }),
    ).toBe("Since Sep 28 · through Oct 2");
    expect(label({ startsAt: "2026-09-29T20:00:00Z" })).toBe("Since Sep 29");
  });

  it("says 'until midnight tonight', not '12:00 AM today', for an ongoing item ending at midnight", () => {
    expect(label({ startsAt: "2026-09-29T13:00:00Z", endsAt: "2026-10-01T04:00:00Z" })).toBe(
      "Since Sep 29 · until midnight tonight",
    );
    // One minute later is tomorrow's 12:01 AM, named with its date.
    expect(label({ startsAt: "2026-09-29T13:00:00Z", endsAt: "2026-10-01T04:01:00Z" })).toBe(
      "Since Sep 29 · until Oct 1, 12:01 AM",
    );
  });

  it("prints the wall clock on both sides of the DST change", () => {
    const options = { now: new Date("2026-11-01T00:30:00-04:00"), timeZone: TZ };
    // 1:30 AM EDT and 1:30 AM EST are an hour apart and both read 1:30 AM.
    expect(eventTimeLabel(item({ startsAt: "2026-11-01T05:30:00Z" }), options)).toBe("1:30 AM");
    expect(eventTimeLabel(item({ startsAt: "2026-11-01T06:30:00Z" }), options)).toBe("1:30 AM");
    expect(
      eventTimeLabel(item({ startsAt: "2027-03-14T13:00:00Z", endsAt: "2027-03-14T14:00:00Z" }), {
        now: new Date("2027-03-14T08:00:00-04:00"),
        timeZone: TZ,
      }),
    ).toBe("9:00 AM – 10:00 AM");
  });

  it("is empty for undated items", () => {
    expect(label({})).toBe("");
  });
});

describe("windowEndLabel", () => {
  it("names the day", () => {
    expect(windowEndLabel("2026-10-04")).toBe("Sunday, Oct 4");
    expect(windowEndLabel("2026-10-13")).toBe("Tuesday, Oct 13");
  });
});
