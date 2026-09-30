import { describe, expect, it } from "vitest";
import { isSourceId, SOURCE_IDS, SOURCES, sourceLabel } from "@/lib/sources";

describe("source registry", () => {
  it("has one entry per id, keyed consistently, with a label", () => {
    expect(new Set(SOURCE_IDS).size).toBe(SOURCE_IDS.length);
    expect(Object.keys(SOURCES).sort()).toEqual([...SOURCE_IDS].sort());
    for (const id of SOURCE_IDS) {
      expect(SOURCES[id].id).toBe(id);
      expect(SOURCES[id].label.trim()).not.toBe("");
    }
  });

  it("covers the sources shown in the Lakeside/Broadsheet mockups", () => {
    const labels = SOURCE_IDS.map(sourceLabel);
    for (const label of [
      "Course schedule",
      "Handshake",
      "WildcatSync",
      "Davidson One",
      "Course site",
      "RateMyProfessors",
      "Athletics",
    ]) {
      expect(labels).toContain(label);
    }
  });

  it("recognises valid ids only", () => {
    expect(isSourceId("handshake")).toBe(true);
    expect(isSourceId("HANDSHAKE")).toBe(false);
    expect(isSourceId(undefined)).toBe(false);
  });
});
