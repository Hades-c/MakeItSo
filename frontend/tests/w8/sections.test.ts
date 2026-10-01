import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course, Section } from "@/lib/types/catalog";
import { course, section, withSection } from "./helpers";

/**
 * Section links resolved on the server (app/(hub)/courses/_lib/sections.ts): "Register as <sibling>" takes the first
 * sibling with seats (WebTree's rule, server/plan/webtree.ts registerAsOf) and links to that section; "Registration
 * section for <title>" looks up the course's title. The catalog reads are replaced here.
 */

const catalog = vi.hoisted(() => ({
  sections: new Map<string, Section>(),
  courses: new Map<string, Course>(),
  failCodes: new Set<string>(),
}));

vi.mock("@/server/catalog", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSection: async (_term: string, crn: string) => catalog.sections.get(crn) ?? null,
  getCourse: async (_term: string, code: string) => {
    if (catalog.failCodes.has(code)) throw new Error("catalog down");
    return catalog.courses.get(code) ?? null;
  },
}));

const { registerAsMap, registerAsOf, regForTitles } =
  await import("@/app/(hub)/courses/_lib/sections");

beforeEach(() => {
  catalog.sections.clear();
  catalog.courses.clear();
  catalog.failCodes.clear();
});

describe("registerAsOf", () => {
  const env = course("202601", "ENV 214").sections.find((s) => s.section === "A")!;
  const phy = section("202601", "PHY 214", "A");

  it("links a max-0 listing to its sibling's page with that section chosen", async () => {
    catalog.sections.set(phy.crn, phy);
    expect(env.enrollment.max).toBe(0);
    expect(await registerAsOf(env)).toEqual({
      label: "PHY 214 A",
      crn: phy.crn,
      href: `/courses/202601/PHY-214?crn=${phy.crn}`,
    });
  });

  it("skips a sibling that is also max 0 and takes the first with seats", async () => {
    const empty = withSection(phy, {
      crn: "29001",
      courseCode: "AAA 214",
      enrollment: { ...phy.enrollment, max: 0 },
    });
    const open = withSection(phy, { crn: "29002", courseCode: "BBB 214" });
    catalog.sections.set(empty.crn, empty);
    catalog.sections.set(open.crn, open);
    const listing = withSection(env, {
      crossListings: [
        { crn: empty.crn, courseCode: empty.courseCode, section: "A" },
        { crn: open.crn, courseCode: open.courseCode, section: "A" },
      ],
    });
    expect(await registerAsOf(listing)).toMatchObject({ label: "BBB 214 A", crn: "29002" });
    // No sibling with seats: no "Register as" at all (WebTree names none either).
    catalog.sections.delete(open.crn);
    expect(await registerAsOf(listing)).toBeNull();
  });

  it("leaves listings with seats alone and keys the map by the max-0 CRN", async () => {
    catalog.sections.set(phy.crn, phy);
    expect(await registerAsOf(phy)).toBeNull();
    expect(Object.keys(await registerAsMap([env, phy]))).toEqual([env.crn]);
  });
});

describe("regForTitles", () => {
  it("names the course a registration-only listing belongs to, and leaves out what it cannot read", async () => {
    const base = section("202602", "CSC 221", "A");
    const reg = withSection(base, { crn: "29100", regFor: "CHE 430" });
    const broken = withSection(base, { crn: "29101", regFor: "XYZ 101" });
    catalog.courses.set("CHE 430", course("202602", "CHE 430"));
    catalog.failCodes.add("XYZ 101");
    expect(await regForTitles([base, reg, broken])).toEqual({
      "CHE 430": course("202602", "CHE 430").title,
    });
  });
});
