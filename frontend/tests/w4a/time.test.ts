import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  dateKeyInZone,
  resolveTimeZone,
  startOfDayInZone,
  weekdayOfKey,
  zonedTimeToUtc,
  zoneOffsetMs,
} from "@/server/feeds/time";
import { TZ } from "./helpers";

const HOUR = 3_600_000;

describe("zonedTimeToUtc (America/New_York wall clock → instant)", () => {
  it("reads EDT and EST wall times with the right offset", () => {
    expect(zonedTimeToUtc({ year: 2026, month: 9, day: 30, hour: 15 }, TZ).toISOString()).toBe(
      "2026-09-30T19:00:00.000Z",
    );
    expect(zonedTimeToUtc({ year: 2026, month: 12, day: 1, hour: 15 }, TZ).toISOString()).toBe(
      "2026-12-01T20:00:00.000Z",
    );
  });

  it("DST ends 2026-11-01: the repeated 1:30 is the first (EDT) one, 2:30 is EST", () => {
    expect(
      zonedTimeToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, TZ).toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
    expect(
      zonedTimeToUtc({ year: 2026, month: 11, day: 1, hour: 2, minute: 30 }, TZ).toISOString(),
    ).toBe("2026-11-01T07:30:00.000Z");
    expect(zoneOffsetMs(Date.parse("2026-11-01T05:59:59Z"), TZ)).toBe(-4 * HOUR);
    expect(zoneOffsetMs(Date.parse("2026-11-01T06:00:00Z"), TZ)).toBe(-5 * HOUR);
  });

  it("DST starts 2027-03-14: the skipped 2:30 moves forward to 3:30 EDT", () => {
    expect(
      zonedTimeToUtc({ year: 2027, month: 3, day: 14, hour: 2, minute: 30 }, TZ).toISOString(),
    ).toBe("2027-03-14T07:30:00.000Z");
    expect(
      zonedTimeToUtc({ year: 2027, month: 3, day: 14, hour: 1, minute: 59 }, TZ).toISOString(),
    ).toBe("2027-03-14T06:59:00.000Z");
    expect(
      zonedTimeToUtc({ year: 2027, month: 3, day: 14, hour: 3, minute: 0 }, TZ).toISOString(),
    ).toBe("2027-03-14T07:00:00.000Z");
  });

  it("works in other zones and in UTC", () => {
    expect(
      zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 9 }, "Europe/London").toISOString(),
    ).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedTimeToUtc({ year: 2026, month: 7, day: 1, hour: 9 }, "UTC").toISOString()).toBe(
      "2026-07-01T09:00:00.000Z",
    );
  });
});

describe("calendar days in America/New_York", () => {
  it("midnight of the DST days: 2026-11-01 is 25 hours, 2027-03-14 is 23 hours", () => {
    const nov1 = startOfDayInZone("2026-11-01", TZ);
    const nov2 = startOfDayInZone("2026-11-02", TZ);
    expect(nov1.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(nov2.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(nov2.getTime() - nov1.getTime()).toBe(25 * HOUR);
    const mar14 = startOfDayInZone("2027-03-14", TZ);
    const mar15 = startOfDayInZone("2027-03-15", TZ);
    expect(mar15.getTime() - mar14.getTime()).toBe(23 * HOUR);
  });

  it("date keys: ET date of an instant, day arithmetic, weekdays", () => {
    expect(dateKeyInZone(new Date("2026-10-01T03:30:00Z"), TZ)).toBe("2026-09-30");
    expect(dateKeyInZone(new Date("2026-10-01T04:30:00Z"), TZ)).toBe("2026-10-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDaysToKey("2026-10-31", 2)).toBe("2026-11-02");
    expect(weekdayOfKey("2026-09-30")).toBe("Wednesday");
    expect(() => startOfDayInZone("30/09/2026", TZ)).toThrow(RangeError);
  });
});

describe("resolveTimeZone (ICS TZID → IANA)", () => {
  it.each([
    ["America/New_York", "America/New_York"],
    ['"America/New_York"', "America/New_York"],
    ["/mozilla.org/20050126_1/America/New_York", "America/New_York"],
    ["Eastern Standard Time", "America/New_York"],
    ["US/Eastern", "US/Eastern"],
    ["UTC", "UTC"],
  ])("%s → %s", (tzid, expected) => {
    expect(resolveTimeZone(tzid)).toBe(expected);
  });

  it("unknown or empty ids resolve to null (the parser then uses campus time)", () => {
    expect(resolveTimeZone("Not/AZone")).toBeNull();
    expect(resolveTimeZone("")).toBeNull();
    expect(resolveTimeZone(null)).toBeNull();
  });
});
