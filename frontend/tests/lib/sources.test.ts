import { describe, expect, it } from "vitest";
import {
  isPerStudentSource,
  isSourceId,
  isSyncedSourceId,
  SOURCE_IDS,
  SOURCES,
  sourceLabel,
  sourcesOfKind,
  sourceTag,
  PER_STUDENT_SOURCE_IDS,
  SYNCED_SOURCE_IDS,
  type SourceKind,
} from "@/lib/sources";

describe("source registry (PLAN §4.1.13)", () => {
  it("has one entry per id, keyed consistently, with a label and a matching uppercase tag", () => {
    expect(new Set(SOURCE_IDS).size).toBe(SOURCE_IDS.length);
    expect(Object.keys(SOURCES).sort()).toEqual([...SOURCE_IDS].sort());
    for (const id of SOURCE_IDS) {
      const info = SOURCES[id];
      expect(info.id).toBe(id);
      expect(info.label.trim()).not.toBe("");
      expect(info.tag).toBe(info.label.toUpperCase());
      if (info.url !== null) expect(info.url).toMatch(/^https:\/\//);
    }
  });

  it("groups sources by kind exactly as the plan lists them", () => {
    const byKind = (kind: SourceKind) => sourcesOfKind(kind).map((s) => s.id);
    expect(byKind("api")).toEqual(["course-schedule", "catalog", "ratemyprofessors"]);
    expect(byKind("feed")).toEqual([
      "wildcatsync",
      "hurt-hub",
      "library",
      "davidsonian",
      "events-digest",
      "davidson-news",
      "course-site",
    ]);
    expect(byKind("curated")).toEqual([
      "registrar",
      "matthews-center",
      "hurt-hub-programs",
      "davidson-offices",
    ]);
    expect(byKind("link")).toEqual(["handshake", "davidson-one", "athletics"]);
    expect(byKind("student")).toEqual(["my-plan"]);
    expect(byKind("ai")).toEqual(["ai"]);
    expect([...SYNCED_SOURCE_IDS]).toEqual([...byKind("api"), ...byKind("feed")]);
  });

  it("syncs course-site (Moodle) per student only, and drops the old academic-calendar id", () => {
    expect(SOURCES["course-site"]).toMatchObject({ label: "Moodle", kind: "feed" });
    expect(isSyncedSourceId("course-site")).toBe(true);
    expect(isPerStudentSource("course-site")).toBe(true);
    expect(SYNCED_SOURCE_IDS.filter(isPerStudentSource)).toEqual([...PER_STUDENT_SOURCE_IDS]);
    expect(isSourceId("academic-calendar")).toBe(false);
  });

  it("uses the tag texts the plan and mockups show", () => {
    expect(sourceTag("my-plan")).toBe("YOUR PLAN");
    expect(sourceTag("wildcatsync")).toBe("WILDCATSYNC");
    expect(sourceTag("davidson-one")).toBe("DAVIDSON ONE");
    expect(sourceTag("handshake")).toBe("HANDSHAKE");
    expect(sourceLabel("course-schedule")).toBe("Course schedule");
    expect(sourceLabel("ratemyprofessors")).toBe("RateMyProfessors");
  });

  it("recognises valid ids only", () => {
    expect(isSourceId("handshake")).toBe(true);
    expect(isSourceId("HANDSHAKE")).toBe(false);
    expect(isSourceId(undefined)).toBe(false);
    expect(isSyncedSourceId("wildcatsync")).toBe(true);
    expect(isSyncedSourceId("handshake")).toBe(false);
  });
});
