import { afterEach, describe, expect, it, vi } from "vitest";
import { registrationTermFrom, type TermScheduleEntry } from "@/lib/term";
import { now } from "@/server/clock";
import { resetEnvCache } from "@/server/env";

afterEach(() => {
  vi.useRealTimers();
  resetEnvCache();
});

describe("server clock (FIXTURES_NOW)", () => {
  it("is pinned to 2026-09-30 in the test suite (vitest.config.mts), whatever the real date", () => {
    vi.useFakeTimers({ now: new Date("2027-03-01T15:00:00Z"), toFake: ["Date"] });
    expect(now().toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("can be moved per test with vi.stubEnv", () => {
    vi.stubEnv("FIXTURES_NOW", "2027-02-01T09:00:00-05:00");
    expect(now().toISOString()).toBe("2027-02-01T14:00:00.000Z");
  });

  it("is the real clock when unset, or outside fixtures mode", () => {
    vi.useFakeTimers({ now: new Date("2027-03-01T15:00:00Z"), toFake: ["Date"] });
    vi.stubEnv("FIXTURES_NOW", "");
    expect(now().toISOString()).toBe("2027-03-01T15:00:00.000Z");
    vi.stubEnv("FIXTURES_NOW", "2026-09-30T12:00:00-04:00");
    vi.stubEnv("EXTERNAL_MODE", "live");
    expect(now().toISOString()).toBe("2027-03-01T15:00:00.000Z");
  });

  it("keeps the fixture world's registration term (202602) after the real one moves to 202701", () => {
    const terms: TermScheduleEntry[] = [
      { code: "202601", startDate: "2026-08-24", endDate: "2026-12-17" },
      { code: "202602", startDate: "2027-01-19", endDate: "2027-05-13" },
      { code: "202701", startDate: "2027-08-23", endDate: "2027-12-16" },
    ];
    vi.useFakeTimers({ now: new Date("2027-02-01T15:00:00Z"), toFake: ["Date"] });
    expect(registrationTermFrom(terms, { now: new Date() })).toBe("202701");
    expect(registrationTermFrom(terms, { now: now() })).toBe("202602");
  });
});
