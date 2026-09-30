import { describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  dayKey,
  formatAsOf,
  formatClock,
  formatLongDate,
  formatSyncTime,
  formatTime,
} from "@/lib/format";

// 2026-09-30 is a Wednesday. Eastern Daylight Time is UTC−4 until 2026-11-01.
const at = (iso: string) => new Date(iso);

describe("format (America/New_York)", () => {
  it("uses the Davidson day, not the server's UTC day", () => {
    // 01:30 UTC on Oct 1 is still 9:30 PM on Sep 30 in Davidson.
    expect(dayKey(at("2026-10-01T01:30:00Z"))).toBe("2026-09-30");
    expect(dayKey(at("2026-10-01T01:30:00Z"), "UTC")).toBe("2026-10-01");
  });

  it("counts calendar days in the zone", () => {
    expect(calendarDaysBetween(at("2026-09-30T13:00:00Z"), at("2026-10-01T03:00:00Z"))).toBe(0);
    expect(calendarDaysBetween(at("2026-09-30T13:00:00Z"), at("2026-10-01T13:00:00Z"))).toBe(1);
    expect(calendarDaysBetween(at("2026-09-30T13:00:00Z"), at("2026-09-29T13:00:00Z"))).toBe(-1);
  });

  it("formats times and dates", () => {
    expect(formatTime(at("2026-09-30T13:05:00Z"))).toBe("9:05 AM");
    expect(formatClock(at("2026-09-30T13:05:00Z"))).toBe("9:05a");
    expect(formatClock(at("2026-09-30T16:00:00Z"))).toBe("12:00p");
    expect(formatClock(at("2026-10-01T03:59:00Z"))).toBe("11:59p");
    expect(formatLongDate(at("2026-09-30T13:05:00Z"))).toBe("Wednesday, September 30");
    expect(formatAsOf(at("2026-09-30T13:05:00Z"))).toBe("Sep 30, 9:05 AM");
  });

  it("labels the last sync with a clock time today, otherwise a date", () => {
    const now = at("2026-09-30T18:00:00Z");
    expect(formatSyncTime(at("2026-09-30T10:00:00Z"), now)).toBe("6:00a");
    expect(formatSyncTime("2026-09-29T13:05:00Z", now)).toBe("Sep 29");
    expect(formatSyncTime(null, now)).toBe("never");
    expect(formatSyncTime("not a date", now)).toBe("never");
  });
});
