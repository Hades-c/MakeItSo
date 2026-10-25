import { describe, expect, it } from "vitest";
import { UNLISTED_PROGRAMS, unlistedProgram, unlistedPrograms } from "@/lib/unlisted-programs";
import { programPublicUrl } from "@/server/programs/catalog-info";
import { programSnapshot, snapshotOfferingNames } from "@/server/programs/snapshot";

/**
 * lib/unlisted-programs.ts: the CIS major and the Middle East Studies minor have no Acalog offering of their own,
 * so they are not official names, and each links the catalog page that describes it.
 */

describe("unlisted programs", () => {
  it("are not official offering names", () => {
    const official = snapshotOfferingNames(["major", "minor", "interdisciplinary-minor"]);
    for (const program of UNLISTED_PROGRAMS) {
      expect(official).not.toContain(program.name);
    }
  });

  it("link the pinned catalog's page of the program that describes them", () => {
    const programs = programSnapshot().programs;
    const pageOf = (name: string) => programs.find((program) => program.name === name);
    const cis = pageOf("Center for Interdisciplinary Studies")!;
    const arab = pageOf("Arab Studies")!;
    // The CIS page lists no offering of its own: its majors are applied for there.
    expect(cis.offerings).toEqual([]);
    expect(unlistedPrograms("major").map((p) => p.sourceUrl)).toEqual([
      programPublicUrl(cis.legacyId),
    ]);
    expect(unlistedPrograms("minor").map((p) => p.sourceUrl)).toEqual([
      programPublicUrl(arab.legacyId),
    ]);
  });

  it("are found by exact name only", () => {
    expect(unlistedProgram("Interdisciplinary Minor in Middle East Studies")?.kind).toBe("minor");
    expect(unlistedProgram("Middle East Studies")).toBeUndefined();
  });
});
