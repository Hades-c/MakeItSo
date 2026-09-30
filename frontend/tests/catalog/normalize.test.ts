import { describe, expect, it } from "vitest";
import {
  FIXTURE_TERMS,
  fixtureItems,
  fixtureSection,
  fixtureSections,
  rawSection,
} from "./helpers";
import { SectionSchema } from "@/lib/types/catalog";
import { normaliseItems } from "@/server/catalog/ingest";
import {
  cleanQuery,
  foldForSearch,
  isOverEnrolled,
  isStaffName,
  linkSections,
  meetingKind,
  normalizeSection,
  openSeats,
  parseClock,
  parseDays,
  parseReqCodes,
  parseRestrictions,
  regForFromTitle,
} from "@/server/catalog/normalize";

interface RawMeeting {
  days: number[];
  weekdays: string;
  start_time: string | null;
  end_time: string | null;
  type: string;
}
interface RawItem {
  crn: number;
  display: string;
  meetings: RawMeeting[];
  notes: { code: string; description: string }[];
  enrollment: { current: number; max: number; remaining: number };
  credits: number;
}

describe("every recorded section normalises to the Section contract", () => {
  it.each(FIXTURE_TERMS)("%s", (term) => {
    const items = fixtureItems(term);
    const { sections, invalid } = normaliseItems(items, term);
    expect(invalid).toBe(0);
    expect(sections).toHaveLength(new Set(items.map((i) => (i as RawItem).crn)).size);
    for (const section of sections) {
      expect(SectionSchema.safeParse(section).success, section.crn).toBe(true);
      expect(section.termCode).toBe(term);
      expect(section.reqCodes).not.toEqual([]);
    }
  });
});

describe("meetings (PLAN §5 Sections)", () => {
  it("maps upstream days 1–5 to M T W R F, as the upstream weekday letters confirm", () => {
    let checked = 0;
    for (const term of FIXTURE_TERMS) {
      for (const item of fixtureItems(term) as RawItem[]) {
        for (const meeting of item.meetings) {
          expect(parseDays(meeting.days).join("")).toBe(meeting.weekdays);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(1800);
    expect(parseDays([6, 7])).toEqual(["S", "U"]);
    expect(parseDays([5, 1, 3])).toEqual(["M", "W", "F"]);
    expect(parseDays([9], "TR")).toEqual(["T", "R"]);
    expect(parseDays(null, null)).toEqual([]);
  });

  it("parses 24 h HHMM start/end times (class_time is ignored)", () => {
    for (const term of FIXTURE_TERMS) {
      const sections = new Map(fixtureSections(term).map((s) => [s.crn, s]));
      for (const item of fixtureItems(term) as RawItem[]) {
        const section = sections.get(String(item.crn));
        item.meetings.forEach((meeting, i) => {
          const parsed = section?.meetings[i];
          const expected = (value: string | null) =>
            value ? `${value.slice(0, 2)}:${value.slice(2)}` : null;
          expect(parsed?.start).toBe(expected(meeting.start_time));
          expect(parsed?.end).toBe(expected(meeting.end_time));
        });
      }
    }
    expect(parseClock("0940")).toBe("09:40");
    expect(parseClock("1340")).toBe("13:40");
    expect(parseClock("940")).toBe("09:40");
    expect(parseClock("09:40")).toBe("09:40");
    expect(parseClock("2400")).toBeNull();
    expect(parseClock("0960")).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock(null)).toBeNull();
  });

  it("marks meetings without days or times TBA", () => {
    let tba = 0;
    for (const term of FIXTURE_TERMS) {
      for (const section of fixtureSections(term)) {
        for (const meeting of section.meetings) {
          expect(meeting.tba).toBe(meeting.days.length === 0 || meeting.start === null);
          if (meeting.tba) tba += 1;
        }
      }
    }
    expect(tba).toBe(262);
    const study = fixtureSection("202601", "CSC 395", "A");
    expect(study.meetings).toEqual([
      { days: [], start: null, end: null, kind: "class", tba: true },
    ]);
  });

  it("keeps second meeting times (labs, discussions) as their own meetings", () => {
    const bio = fixtureSection("202201", "BIO 111", "A");
    expect(bio.meetings).toEqual([
      {
        days: ["T"],
        start: "13:40",
        end: "16:20",
        building: "Wall Academic Center",
        room: "104",
        kind: "second",
        tba: false,
      },
      {
        days: ["T", "R"],
        start: "09:40",
        end: "10:55",
        building: "Wall Academic Center",
        room: "210",
        kind: "class",
        tba: false,
      },
    ]);
    expect(meetingKind("lecture")).toBe("class");
    expect(meetingKind("second meeting time")).toBe("second");
    expect(meetingKind("Laboratory")).toBe("lab");
    expect(meetingKind("recital")).toBe("other");
    expect(meetingKind(null)).toBe("class");
  });
});

describe("instructors, seats, titles, credits", () => {
  it("flags the Staff placeholder and keeps upstream order", () => {
    expect(fixtureSection("202602", "RUS 496", "A").instructors).toEqual([
      { first: "S", last: "Staff", isStaff: true },
    ]);
    const staff = fixtureSections("202602").flatMap((s) => s.instructors.filter((i) => i.isStaff));
    expect(staff).toHaveLength(1);
    const hum = fixtureSection("202501", "HUM 103", "A");
    expect(hum.instructors.map((i) => i.last).length).toBeGreaterThan(1);
    expect(isStaffName("", "Staff")).toBe(true);
    expect(isStaffName("", "")).toBe(true);
    expect(isStaffName("Hilary", "Green")).toBe(false);
  });

  it("keeps raw seat counts; open seats are max(0, remaining), negative = over-enrolled", () => {
    const art = fixtureSection("202201", "ART 111", "A");
    expect(art.enrollment).toEqual({ current: 12, max: 10, remaining: -2 });
    expect(openSeats(art.enrollment)).toBe(0);
    expect(isOverEnrolled(art.enrollment)).toBe(true);
    const afr = fixtureSection("202602", "AFR 101", "A");
    expect(openSeats(afr.enrollment)).toBe(30);
    expect(isOverEnrolled(afr.enrollment)).toBe(false);
  });

  it("keeps per-section titles, trimmed and decoded", () => {
    expect(fixtureSection("202602", "AFR 101", "A").title).toBe("Intro to Africana Studies");
    const wri = fixtureSections("202601").filter((s) => s.courseCode === "WRI 101");
    expect(new Set(wri.map((s) => s.title)).size).toBeGreaterThan(15);
    expect(fixtureSection("202601", "WRI 101", "A").title).toBe("According to Science");
  });

  it("takes credits from the API: 0, 1 or 2", () => {
    const credits = new Set(FIXTURE_TERMS.flatMap((t) => fixtureSections(t).map((s) => s.credits)));
    expect([...credits].sort()).toEqual([0, 1, 2]);
    expect(fixtureSection("202601", "HUM 103", "A").credits).toBe(2);
    expect(fixtureSection("202601", "MIL 101", "L").credits).toBe(0);
    expect(fixtureSections("202601").find((s) => s.courseCode === "MUS 055")?.credits).toBe(0);
  });
});

describe("requirement codes (null = no data, never [])", () => {
  it("parses codes of this listing", () => {
    expect(parseReqCodes([])).toBeNull();
    expect(parseReqCodes(null)).toBeNull();
    expect(parseReqCodes([{ code: "NONE" }])).toEqual(["NONE"]);
    expect(parseReqCodes([{ code: "JEC" }, { code: "SSRQ" }, { code: "JEC" }])).toEqual([
      "JEC",
      "SSRQ",
    ]);
    expect(parseReqCodes([{ code: "SSCI" }])).toBeNull();
  });

  it("drops the legacy SSCI code, keeps NSCI (shown as 'verify') and NONE", () => {
    const edu = normalizeSection(rawSection("202202", "EDU 241"), "202202");
    expect(edu.ok && edu.section.reqCodes).toEqual(["SSRQ"]);
    expect(fixtureSection("202501", "PHY 395", "A").reqCodes).toEqual(["NSCI"]);
    const none = fixtureSections("202602").filter((s) => s.reqCodes?.[0] === "NONE");
    const missing = fixtureSections("202602").filter((s) => s.reqCodes === null);
    expect(none.length).toBeGreaterThan(0);
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe("notes and restrictions", () => {
  it("keeps note descriptions verbatim, in upstream order", () => {
    for (const term of ["202601", "202602"]) {
      const sections = new Map(fixtureSections(term).map((s) => [s.crn, s]));
      for (const item of fixtureItems(term) as RawItem[]) {
        const section = sections.get(String(item.crn));
        expect(section?.notes).toEqual(item.notes.map((n) => n.description.trim()));
        expect(section?.noteCodes).toEqual(item.notes.map((n) => n.code));
      }
    }
  });

  it.each([
    ["1", [1], false],
    ["1+", [1], true],
    ["12", [1, 2], false],
    ["12+", [1, 2], true],
    ["123", [1, 2, 3], false],
    ["123+", [1, 2, 3], true],
    ["23", [2, 3], false],
    ["234", [2, 3, 4], false],
    ["234+", [2, 3, 4], true],
    ["3", [3], false],
    ["34", [3, 4], false],
    ["34+", [3, 4], true],
    ["4", [4], false],
    ["4+", [4], true],
  ] as const)("class-year code %s", (code, years, untilFirstDay) => {
    expect(parseRestrictions([code])).toEqual({
      eligibleYears: years,
      untilFirstDay,
      permissionRequired: false,
      notIfCompMet: false,
    });
  });

  it("reads PRM and W, ignores the other codes", () => {
    expect(parseRestrictions(["PRM", "PRQ", "XLST", "AT-II", "R"])).toEqual({
      eligibleYears: null,
      untilFirstDay: false,
      permissionRequired: true,
      notIfCompMet: false,
    });
    expect(parseRestrictions(["W"]).notIfCompMet).toBe(true);
    expect(parseRestrictions(["12+", "34"])).toEqual({
      eligibleYears: [1, 2, 3, 4],
      untilFirstDay: false,
      permissionRequired: false,
      notIfCompMet: false,
    });
    expect(fixtureSection("202601", "WRI 101", "A").restrictions.notIfCompMet).toBe(true);
    expect(fixtureSection("202601", "ECO 386", "A").restrictions.permissionRequired).toBe(true);
  });

  it("derives restrictions for every recorded section from its note codes", () => {
    for (const term of FIXTURE_TERMS) {
      for (const section of fixtureSections(term)) {
        expect(section.restrictions).toEqual(parseRestrictions(section.noteCodes));
      }
    }
    const firstYears = fixtureSections("202601").filter(
      (s) => s.restrictions.eligibleYears?.join() === "1,2" && s.restrictions.untilFirstDay,
    );
    expect(firstYears.length).toBeGreaterThan(0);
  });
});

describe("cross-listings, cross-postings, registration sections", () => {
  it("links cross-listed siblings by CRN (ENV 214 A ↔ PHY 214 A, not PHY 214 B)", () => {
    expect(fixtureSection("202601", "ENV 214", "A").crossListings).toEqual([
      { crn: "10393", courseCode: "PHY 214", section: "A" },
    ]);
    expect(fixtureSection("202601", "ENV 214", "B").crossListings).toEqual([
      { crn: "10394", courseCode: "PHY 214", section: "B" },
    ]);
    expect(fixtureSection("202601", "PHY 214", "A").canonicalCode).toBe("ENV 214");
  });

  it("never leaves a sibling CRN dangling in a recorded term", () => {
    for (const term of FIXTURE_TERMS) {
      const crns = new Set(fixtureSections(term).map((s) => s.crn));
      for (const section of fixtureSections(term)) {
        for (const listing of section.crossListings) expect(crns.has(listing.crn)).toBe(true);
      }
    }
  });

  it("keeps cross-postings as browse tags", () => {
    expect(fixtureSection("202201", "CSC 121", "A").crossPostings).toEqual(["DIG", "IDAT"]);
  });

  it("keeps reg_fors on the class; regFor only on a listing that is a registration section", () => {
    const che = fixtureSection("202602", "CHE 430", "A");
    expect(che.regFor).toBeNull();
    expect(che.registrationSections).toEqual([
      { crn: "20083", courseCode: "BIO 395", section: "A" },
    ]);
    expect(che.searchText).toContain("bio 395");
    for (const [code, target] of [
      ["EDU 221", "SOC 221"],
      ["EDU 330", "SOC 330"],
      ["PSY 241", "EDU 241"],
    ] as const) {
      expect(fixtureSection("202602", code, "A").registrationSections[0]?.courseCode).toBe(target);
    }
    expect(fixtureSections("202602").filter((s) => s.regFor !== null)).toEqual([]);

    // When the registration listing itself is in the data, it points at the class.
    const base = rawSection("202602", "CHE 430 A");
    const regListing = {
      ...base,
      crn: 20083,
      subject: { code: "BIO", description: "Biology" },
      course_number: "395",
      course_title: "REG FOR CHE 430-A",
      reg_fors: [],
    };
    const results = [base, regListing].map((raw) => normalizeSection(raw, "202602"));
    const linked = linkSections(results.flatMap((r) => (r.ok ? [r.section] : [])));
    expect(linked.map((s) => [s.courseCode, s.regFor])).toEqual([
      ["CHE 430", null],
      ["BIO 395", "CHE 430"],
    ]);
    expect(regForFromTitle("REG FOR CHE 430-A")).toBe("CHE 430");
    expect(regForFromTitle("Registration for EDU 221")).toBe("EDU 221");
    expect(regForFromTitle("Regional Geography")).toBeNull();
  });
});

describe("search text", () => {
  it("folds case and accents and holds both code spellings", () => {
    expect(foldForSearch("  Beyoncé  and ÉCOLE ")).toBe("beyonce and ecole");
    // Apostrophes in every spelling vanish on both sides (iOS types ’), invisible characters too.
    for (const name of [
      "O'Geen",
      "O\u2019Geen",
      "O\u2018Geen",
      "O\u02BCGeen",
      "O''Geen",
      "O`Geen",
    ]) {
      expect(foldForSearch(name), name).toBe("ogeen");
    }
    expect(foldForSearch("Women\u2019s \u201CVoices\u201D")).toBe('womens "voices"');
    expect(foldForSearch("CSC\u200B121\u00AD\uFEFF")).toBe("csc121");
    expect(cleanQuery(" \u200B\uFF23\uFF33\uFF23\u3000\uFF11\uFF12\uFF11 ")).toBe("CSC 121");
    const section = fixtureSection("202602", "AFR 101", "A");
    expect(section.searchText).toContain("afr 101 afr101");
    expect(section.searchText).toContain("hilary green");
    expect(section.searchText).toContain("intro to africana studies");
  });

  it("rejects a section without a usable code", () => {
    const raw = { ...rawSection("202602", "AFR 101 A"), course_number: "1A" };
    expect(normalizeSection(raw, "202602")).toMatchObject({ ok: false, crn: "20001" });
  });
});
