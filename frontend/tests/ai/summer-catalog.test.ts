import { describe, expect, it } from "vitest";
import { resolveSummers } from "@/app/(hub)/careers/_lib/activities";
import { optionPayloads } from "@/server/ai/features/career-summers";
import { optionSlug, summerCatalog, summerEntryId } from "@/server/ai/summer-catalog";
import { SUMMER_OFFICE_PROGRAMS } from "@/server/content/career-activities";
import { CAREERS, getCareer } from "@/server/content/careers";
import { getProgram, OFFICES, PROGRAMS } from "@/server/content/offices";

/** The summer options the AI summer picks choose from: sourced content only, this path's first. */

describe("summerCatalog", () => {
  it("lists this path's entries first, then every other path's once, then the office programs for any path", () => {
    const career = getCareer("software-engineering")!;
    const catalog = summerCatalog(career);
    const own = resolveSummers(career.summer, PROGRAMS, OFFICES);
    expect(catalog.slice(0, own.length).map((e) => e.option.name)).toEqual(own.map((v) => v.name));
    expect(catalog.filter((e) => e.option.onThisPage)).toHaveLength(own.length);
    const ids = catalog.map((e) => e.option.id);
    expect(new Set(ids).size).toBe(ids.length);
    const everyEntry = new Set(CAREERS.flatMap((c) => (c.summer ?? []).map(summerEntryId)));
    for (const id of everyEntry) expect(ids).toContain(id);
    for (const slug of SUMMER_OFFICE_PROGRAMS) expect(ids).toContain(`program:${slug}`);
    expect(catalog).toHaveLength(
      new Set([...everyEntry, ...SUMMER_OFFICE_PROGRAMS.map((s) => `program:${s}`)]).size,
    );
  });

  it("shows only the content's facts: each option is what the careers page resolves for it", () => {
    for (const career of CAREERS) {
      for (const entry of summerCatalog(career)) {
        const id = entry.option.id;
        const [view] = id.startsWith("program:")
          ? resolveSummers(
              [{ kind: "program", program: id.slice(8), description: "x" }],
              PROGRAMS,
              OFFICES,
            )
          : resolveSummers(
              CAREERS.flatMap((c) => c.summer ?? []).filter((s) => summerEntryId(s) === id),
              PROGRAMS,
              OFFICES,
            );
        expect(view, id).toBeDefined();
        expect(entry.option).toMatchObject({
          name: view!.name,
          url: view!.url,
          audience: view!.audience,
          timing: view!.timing,
          source: view!.source,
          verifiedAt: view!.verifiedAt,
        });
      }
    }
  });

  it("says who lists each option and gives the model no URLs", () => {
    const catalog = summerCatalog(getCareer("law")!);
    const reu = catalog.find(
      (e) =>
        e.option.id ===
        `outside:${optionSlug("NSF Research Experiences for Undergraduates (REU)")}`,
    );
    expect(reu?.listedFor).toContain("Software Engineering");
    expect(reu?.option.onThisPage).toBe(false);
    const grants = catalog.find(
      (e) => e.option.id === "program:summer-internship-grants-common-application",
    );
    expect(grants?.listedFor).toEqual([]);
    expect(grants?.runBy).toMatch(/Matthews Center/);
    expect(JSON.stringify(optionPayloads(catalog))).not.toMatch(/https?:|www\./);
  });

  it("every office program for any path exists and is a summer option on its own page", () => {
    for (const slug of SUMMER_OFFICE_PROGRAMS) {
      const program = getProgram(slug);
      expect(program, slug).toBeDefined();
      expect(`${program!.name} ${program!.description} ${program!.audience ?? ""}`, slug).toMatch(
        /summer/i,
      );
    }
  });

  it("a path without summer entries of its own (sports-management) still has options", () => {
    const catalog = summerCatalog(getCareer("sports-management")!);
    expect(catalog.some((e) => e.option.onThisPage)).toBe(false);
    expect(catalog.length).toBeGreaterThan(30);
  });
});
