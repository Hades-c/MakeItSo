import { describe, expect, it } from "vitest";
import { describeFailure } from "@/app/(hub)/profile/_lib/errors";
import { exportFilename } from "@/app/(hub)/profile/_lib/download";
import {
  academicYearEndAt,
  cleanNames,
  defaultFirstTermFor,
  derivedStanding,
  fieldErrorsFromIssues,
  firstTermFits,
  firstTermOptions,
  graduationYearOptions,
  STANDING_CHOICES,
  STANDING_LABELS,
  standingSummary,
} from "@/app/(hub)/profile/_lib/options";
import { ApiClientError } from "@/lib/api/client";
import { CLASS_STANDINGS } from "@/lib/term";
import { defaultFirstTerm } from "@/server/auth/profile";

const NOW = "2026-09-30T16:00:00.000Z";

describe("graduation years", () => {
  it("rolls the academic year over on June 1 in ET", () => {
    expect(academicYearEndAt(NOW)).toBe(2027);
    expect(academicYearEndAt("2027-05-31T12:00:00-04:00")).toBe(2027);
    expect(academicYearEndAt("2027-06-01T00:30:00-04:00")).toBe(2028);
    // 11:30 PM ET on May 31 is June 1 in UTC: still the old academic year.
    expect(academicYearEndAt("2027-06-01T03:30:00.000Z")).toBe(2027);
  });

  it("offers last year's class through the class entering next year", () => {
    expect(graduationYearOptions(NOW)).toEqual([2026, 2027, 2028, 2029, 2030, 2031]);
  });

  it("keeps a stored year outside that span", () => {
    expect(graduationYearOptions(NOW, 2024)).toEqual([2024, 2026, 2027, 2028, 2029, 2030, 2031]);
    expect(graduationYearOptions(NOW, 2029)).toHaveLength(6);
    expect(graduationYearOptions(NOW, null)).toHaveLength(6);
  });
});

describe("first term", () => {
  it("defaults to Fall four years before graduation, as the server does", () => {
    expect(defaultFirstTermFor(2030)).toBe("202601");
    for (const year of [2026, 2027, 2030, 2031]) {
      expect(defaultFirstTermFor(year)).toBe(defaultFirstTerm(year));
    }
  });

  it("mirrors the server's fit rule: regular terms from 8 years before to the last Spring", () => {
    expect(firstTermFits("202601", 2030)).toBe(true);
    expect(firstTermFits("202201", 2030)).toBe(true);
    expect(firstTermFits("202102", 2030)).toBe(false);
    expect(firstTermFits("202902", 2030)).toBe(true);
    expect(firstTermFits("203001", 2030)).toBe(false);
    expect(firstTermFits("202603", 2030)).toBe(false);
  });

  it("offers Fall six years before graduation through the Spring before it", () => {
    const options = firstTermOptions(2030);
    expect(options[0]).toEqual({ code: "202401", label: "Fall 2024" });
    expect(options.at(-1)).toEqual({ code: "202902", label: "Spring 2030" });
    expect(options).toHaveLength(12);
    expect(options.every((o) => firstTermFits(o.code, 2030))).toBe(true);
  });

  it("keeps a stored first term that still fits, in order", () => {
    const options = firstTermOptions(2030, "202302").map((o) => o.code);
    expect(options[0]).toBe("202302");
    expect(options).toHaveLength(13);
    // One that no longer fits is not offered (the form keeps it visible and explains on Save).
    expect(firstTermOptions(2030, "201901").map((o) => o.code)).not.toContain("201901");
  });
});

describe("class standing", () => {
  it("labels every standing", () => {
    expect(STANDING_CHOICES).toEqual(CLASS_STANDINGS);
    expect(Object.keys(STANDING_LABELS)).toEqual([...CLASS_STANDINGS]);
  });

  it("derives it from the graduation year unless the student set it", () => {
    expect(derivedStanding(2030, NOW, null)).toEqual({ standing: "first-year", estimated: true });
    expect(derivedStanding(2027, NOW, null)).toEqual({ standing: "senior", estimated: true });
    expect(derivedStanding(2031, NOW, null)).toEqual({ standing: "incoming", estimated: true });
    expect(derivedStanding(2026, NOW, null)).toEqual({ standing: "graduated", estimated: true });
    expect(derivedStanding(2030, NOW, "sophomore")).toEqual({
      standing: "sophomore",
      estimated: false,
    });
    expect(standingSummary(derivedStanding(2029, NOW, null))).toBe(
      "Sophomore (from your graduation year)",
    );
    expect(standingSummary(derivedStanding(2029, NOW, "junior"))).toBe("Junior (set by you)");
  });
});

describe("form helpers", () => {
  it("maps server issues onto fields, first message per field", () => {
    expect(
      fieldErrorsFromIssues(
        [
          { path: "majors.1", message: "Pick a name from the list of programs." },
          { path: "majors.2", message: "second" },
          {
            path: "firstTerm",
            message: "The first term and the graduation year do not fit together.",
          },
          { path: "unknown", message: "ignored" },
        ],
        ["majors", "minors", "firstTerm"] as const,
      ),
    ).toEqual({
      majors: "Pick a name from the list of programs.",
      firstTerm: "The first term and the graduation year do not fit together.",
    });
  });

  it("drops blank and repeated program rows", () => {
    expect(
      cleanNames(["Major in Biology (B.S. Degree)", "", " ", "Major in Biology (B.S. Degree)"]),
    ).toEqual(["Major in Biology (B.S. Degree)"]);
  });

  it("names the export like the route does", () => {
    expect(exportFilename("2026-09-30T16:00:00.000Z")).toBe("makeitso-data-2026-09-30.json");
  });

  it("turns failures into one safe sentence or field issues", () => {
    expect(describeFailure(new TypeError("fetch failed"))).toEqual({
      message: "Could not reach MakeItSo. Check your connection and try again.",
      issues: [],
      signedOut: false,
    });
    expect(
      describeFailure(new ApiClientError(401, "unauthorized", "Sign in to continue.")),
    ).toMatchObject({
      signedOut: true,
      message: "Your session has ended. Sign in again to continue.",
    });
    const issues = [{ path: "password", message: "That password is not right." }];
    expect(
      describeFailure(
        new ApiClientError(400, "validation_failed", "Some fields are invalid.", issues),
      ),
    ).toEqual({ message: null, issues, signedOut: false });
    expect(
      describeFailure(new ApiClientError(400, "validation_failed", "Some fields are invalid."))
        .message,
    ).toBe("Some fields are invalid.");
    expect(
      describeFailure(
        new ApiClientError(429, "rate_limited", "Too many exports today. Try tomorrow."),
      ).message,
    ).toBe("Too many exports today. Try tomorrow.");
    expect(describeFailure(new ApiClientError(500, "internal", "stack trace here")).message).toBe(
      "Something went wrong. Please try again.",
    );
    expect(describeFailure(new ApiClientError(200, "invalid_response", "x")).message).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
