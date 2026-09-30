import { describe, expect, it } from "vitest";
import { fixtureSections } from "../catalog/helpers";
import type { Meeting } from "@/lib/types/catalog";
import { ScheduleConflictSchema, type ConflictInput } from "@/lib/types/plan";
import { detectConflicts } from "@/server/plan";
import { areSiblings, conflictWindowLabel, isTimedMeeting } from "@/server/plan/conflicts";

/** detectConflicts (PLAN §5 "Sections", "WebTree list"): pure, second meeting times in, TBA out, siblings by CRN. */

function meeting(
  days: string,
  start: string | null,
  end: string | null,
  kind: Meeting["kind"] = "class",
): Meeting {
  const list = [...days] as Meeting["days"];
  return { days: list, start, end, kind, tba: list.length === 0 || start === null };
}

function section(
  crn: string,
  courseCode: string,
  meetings: Meeting[],
  siblings: string[] = [],
): ConflictInput {
  return {
    crn,
    courseCode,
    meetings,
    crossListings: siblings.map((sibling) => ({
      crn: sibling,
      courseCode: "ENV 214",
      section: "A",
    })),
  };
}

const bySection = (term: string, code: string, sec: string) => {
  const found = fixtureSections(term).find((s) => s.courseCode === code && s.section === sec);
  if (!found) throw new Error(`no ${code} ${sec}`);
  return found;
};

describe("detectConflicts", () => {
  it("reports each shared day with the overlapping window", () => {
    const a = section("20001", "CSC 221", [meeting("MWF", "10:30", "11:20")]);
    const b = section("20002", "ECO 232", [meeting("MW", "11:00", "12:15")]);
    const conflicts = detectConflicts([a, b]);
    expect(conflicts).toEqual([
      {
        a: { crn: "20001", courseCode: "CSC 221" },
        b: { crn: "20002", courseCode: "ECO 232" },
        day: "M",
        start: "11:00",
        end: "11:20",
      },
      {
        a: { crn: "20001", courseCode: "CSC 221" },
        b: { crn: "20002", courseCode: "ECO 232" },
        day: "W",
        start: "11:00",
        end: "11:20",
      },
    ]);
    for (const conflict of conflicts) ScheduleConflictSchema.parse(conflict);
    expect(conflictWindowLabel(conflicts[0]!)).toBe("Mon 11:00–11:20");
  });

  it("does not report back-to-back meetings or different days", () => {
    const a = section("20001", "CSC 221", [meeting("MWF", "10:30", "11:20")]);
    const touching = section("20002", "ECO 232", [meeting("MWF", "11:20", "12:10")]);
    const otherDays = section("20003", "HIS 357", [meeting("TR", "10:30", "11:45")]);
    expect(detectConflicts([a, touching, otherDays])).toEqual([]);
  });

  it("includes second meeting times (labs) and leaves TBA meetings out", () => {
    const lab = section("10049", "BIO 115", [
      meeting("M", "13:30", "16:20", "second"),
      meeting("MWF", "08:30", "09:20"),
    ]);
    const afternoon = section("10187", "ECO 386", [meeting("M", "13:30", "16:20")]);
    const tba = section("10753", "ANT 498", [meeting("", null, null)]);
    const conflicts = detectConflicts([lab, afternoon, tba]);
    expect(conflicts).toEqual([
      {
        a: { crn: "10049", courseCode: "BIO 115" },
        b: { crn: "10187", courseCode: "ECO 386" },
        day: "M",
        start: "13:30",
        end: "16:20",
      },
    ]);
    expect(isTimedMeeting(meeting("", null, null))).toBe(false);
    expect(isTimedMeeting(meeting("M", "10:00", null))).toBe(false);
  });

  it("never reports cross-listed siblings (by CRN, either direction) or the same CRN", () => {
    const phy = section("10393", "PHY 214", [meeting("MWF", "12:30", "14:20")], ["10227"]);
    const env = section("10227", "ENV 214", [meeting("MWF", "12:30", "14:20")]);
    expect(areSiblings(phy, env)).toBe(true);
    expect(areSiblings(env, phy)).toBe(true);
    expect(detectConflicts([phy, env])).toEqual([]);
    expect(detectConflicts([phy, { ...phy }])).toEqual([]);
    // Same code, different pairing: PHY 214 A and ENV 214 B are different classes.
    const envB = section("10228", "ENV 214", [meeting("MWF", "12:30", "14:20")], ["10394"]);
    expect(detectConflicts([phy, envB])).toHaveLength(3);
  });

  it("accepts real Section objects (the catalog's fixture data)", () => {
    const csc = bySection("202602", "CSC 221", "A");
    const spa = bySection("202602", "SPA 201", "B");
    const phy = bySection("202601", "PHY 214", "A");
    const env = bySection("202601", "ENV 214", "A");
    expect(detectConflicts([csc, spa]).map((c) => `${c.day} ${c.start}-${c.end}`)).toEqual([
      "M 10:30-11:20",
      "W 10:30-11:20",
      "F 10:30-11:20",
    ]);
    expect(detectConflicts([phy, env])).toEqual([]);
  });

  it("orders by input pair, then day, then start, and reports each window once", () => {
    const a = section("20001", "CSC 221", [
      meeting("MWF", "10:30", "11:20"),
      meeting("F", "10:30", "11:20", "second"),
    ]);
    const b = section("20002", "ECO 232", [meeting("FM", "10:00", "11:00")]);
    const c = section("20003", "HIS 357", [meeting("M", "08:00", "10:45")]);
    const out = detectConflicts([a, b, c]).map((x) => `${x.a.crn}-${x.b.crn} ${x.day} ${x.start}`);
    expect(out).toEqual([
      "20001-20002 M 10:30",
      "20001-20002 F 10:30",
      "20001-20003 M 10:30",
      "20002-20003 M 10:00",
    ]);
  });

  it("normalises codes and CRNs like the contract (ConflictInputSchema)", () => {
    const out = detectConflicts([
      {
        crn: 20001,
        courseCode: "csc221",
        meetings: [meeting("M", "09:00", "10:00")],
      } as unknown as ConflictInput,
      { crn: "20002", courseCode: "ECO 232", meetings: [meeting("M", "09:30", "10:30")] },
    ]);
    expect(out[0]?.a).toEqual({ crn: "20001", courseCode: "CSC 221" });
  });
});
