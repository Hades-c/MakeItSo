import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  DEFAULT_EVENT_RANGE,
  EVENT_RANGE_LABELS,
  EVENT_RANGES,
  isEventRange,
  isoWeekday,
  rangeWindow,
  startOfDayInZone,
} from "@/app/(hub)/events/_lib/range";

const TZ = "America/New_York";
/** FIXTURES_NOW: Wednesday 2026-09-30, noon ET. */
const NOW = new Date("2026-09-30T12:00:00-04:00");

describe("day keys", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToKey("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDaysToKey("2026-09-30", 14)).toBe("2026-10-14");
    expect(() => addDaysToKey("30/09/2026", 1)).toThrow(RangeError);
  });

  it("numbers weekdays Monday 1 … Sunday 7", () => {
    expect(isoWeekday("2026-09-28")).toBe(1);
    expect(isoWeekday("2026-09-30")).toBe(3);
    expect(isoWeekday("2026-10-04")).toBe(7);
  });
});

describe("startOfDayInZone", () => {
  it("is local midnight: EDT, EST and across both 2026-27 DST changes", () => {
    expect(startOfDayInZone("2026-09-30", TZ).toISOString()).toBe("2026-09-30T04:00:00.000Z");
    // DST ends 2026-11-01 at 2 AM: that day starts in EDT, the next in EST.
    expect(startOfDayInZone("2026-11-01", TZ).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(startOfDayInZone("2026-11-02", TZ).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    // DST starts 2027-03-14 at 2 AM: that day starts in EST, the next in EDT.
    expect(startOfDayInZone("2027-03-14", TZ).toISOString()).toBe("2027-03-14T05:00:00.000Z");
    expect(startOfDayInZone("2027-03-15", TZ).toISOString()).toBe("2027-03-15T04:00:00.000Z");
  });

  it("works for any IANA zone", () => {
    expect(startOfDayInZone("2026-09-30", "UTC").toISOString()).toBe("2026-09-30T00:00:00.000Z");
    expect(startOfDayInZone("2026-09-30", "Asia/Kolkata").toISOString()).toBe(
      "2026-09-29T18:30:00.000Z",
    );
  });
});

describe("rangeWindow", () => {
  it("knows its presets", () => {
    expect(EVENT_RANGES).toEqual(["today", "week", "14d"]);
    expect(DEFAULT_EVENT_RANGE).toBe("14d");
    expect(EVENT_RANGE_LABELS).toEqual({
      today: "Today",
      week: "This week",
      "14d": "Next 14 days",
    });
    expect(isEventRange("week")).toBe(true);
    expect(isEventRange("month")).toBe(false);
    expect(isEventRange(undefined)).toBe(false);
  });

  it("starts at now and ends at a local midnight", () => {
    const today = rangeWindow("today", NOW, TZ);
    expect(today).toEqual({
      range: "today",
      from: NOW,
      to: new Date("2026-10-01T04:00:00.000Z"),
      today: "2026-09-30",
      lastDay: "2026-09-30",
    });
    // Wednesday: this week runs through Sunday.
    const week = rangeWindow("week", NOW, TZ);
    expect(week.to.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    expect(week.lastDay).toBe("2026-10-04");
    // Next 14 days: today and 13 more.
    const fortnight = rangeWindow("14d", NOW, TZ);
    expect(fortnight.to.toISOString()).toBe("2026-10-14T04:00:00.000Z");
    expect(fortnight.lastDay).toBe("2026-10-13");
  });

  it("this week on a Sunday is just Sunday; on a Monday it is the whole week", () => {
    const sunday = rangeWindow("week", new Date("2026-10-04T09:00:00-04:00"), TZ);
    expect(sunday.lastDay).toBe("2026-10-04");
    expect(sunday.to.toISOString()).toBe("2026-10-05T04:00:00.000Z");
    const monday = rangeWindow("week", new Date("2026-10-05T09:00:00-04:00"), TZ);
    expect(monday.lastDay).toBe("2026-10-11");
  });

  it("uses the campus day, not the UTC day, late in the evening", () => {
    // 11:30 PM ET on Sep 30 is already Oct 1 in UTC.
    const late = rangeWindow("today", new Date("2026-10-01T03:30:00.000Z"), TZ);
    expect(late.today).toBe("2026-09-30");
    expect(late.to.toISOString()).toBe("2026-10-01T04:00:00.000Z");
  });

  it("ends on the right midnight across the DST change", () => {
    // Two weeks from Oct 30 ends at midnight EST (05:00Z), after the Nov 1 change.
    const window = rangeWindow("14d", new Date("2026-10-30T12:00:00-04:00"), TZ);
    expect(window.lastDay).toBe("2026-11-12");
    expect(window.to.toISOString()).toBe("2026-11-13T05:00:00.000Z");
    // A week that contains the spring change ends at midnight EDT (04:00Z).
    const spring = rangeWindow("week", new Date("2027-03-10T12:00:00-05:00"), TZ);
    expect(spring.to.toISOString()).toBe("2027-03-15T04:00:00.000Z");
  });
});
