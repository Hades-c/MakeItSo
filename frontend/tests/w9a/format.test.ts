import { afterEach, describe, expect, it } from "vitest";
import {
  formatContentDate,
  formatMonthYear,
  formatUsd,
  occupationName,
  pluralize,
  shortUrl,
} from "@/app/(hub)/careers/_lib/format";

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("careers formatting", () => {
  it("formats BLS pay in whole dollars", () => {
    expect(formatUsd(135980)).toBe("$135,980");
    expect(formatUsd(62200)).toBe("$62,200");
  });

  it("names a BLS occupation without the content's asides (the card's short form)", () => {
    expect(
      occupationName(
        "Securities, commodities, and financial services sales agents (the OOH page describes investment bankers within this occupation)",
      ),
    ).toBe("Securities, commodities, and financial services sales agents");
    expect(occupationName("Top executives (BLS pay data exclude self-employed workers)")).toBe(
      "Top executives",
    );
    expect(occupationName("Meeting, Convention, and Event Planners")).toBe(
      "Meeting, Convention, and Event Planners",
    );
    // Nothing but an aside: keep the text rather than show nothing.
    expect(occupationName("(unnamed)")).toBe("(unnamed)");
  });

  it("formats content dates as calendar days, never shifted by the time zone", () => {
    for (const tz of ["America/New_York", "Pacific/Honolulu", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = tz;
      expect(formatContentDate("2026-09-30")).toBe("Sep 30, 2026");
      expect(formatContentDate("2026-01-01")).toBe("Jan 1, 2026");
      expect(formatMonthYear("2024-11-01")).toBe("Nov 2024");
    }
  });

  it("returns text it cannot parse as it is", () => {
    expect(formatContentDate("2026-02-30")).toBe("2026-02-30");
    expect(formatContentDate("soon")).toBe("soon");
    expect(formatMonthYear("")).toBe("");
  });

  it("pluralizes", () => {
    expect(pluralize(1, "section")).toBe("1 section");
    expect(pluralize(0, "section")).toBe("0 sections");
    expect(pluralize(2, "person", "people")).toBe("2 people");
  });

  it("shortens source URLs readably", () => {
    expect(shortUrl("https://www.davidson.edu/news/2024/05/13/story/")).toBe(
      "davidson.edu/news/2024/05/13/story",
    );
    expect(shortUrl("https://catalog.davidson.edu/content.php?catoid=26&navoid=1245")).toBe(
      "catalog.davidson.edu/content.php?catoid=26&navoid=1245",
    );
    expect(shortUrl("not a url")).toBe("not a url");
  });
});
