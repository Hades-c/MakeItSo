import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACALOG_CATALOG, MIN_PROGRAM_COUNT } from "@/server/programs/catalog-info";
import { programKey } from "@/server/programs/names";
import { buildSnapshot, programSnapshot, ProgramSnapshotSchema } from "@/server/programs/snapshot";
import rawSnapshot from "@/server/programs/snapshot.json";
import {
  AcalogProgramDetailSchema,
  AcalogProgramListSchema,
  isPublicProgram,
} from "@/server/programs/upstream";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "external", "catalog");
const read = (file: string) =>
  JSON.parse(readFileSync(path.join(FIXTURES, file), "utf8")) as unknown;
const LIST = AcalogProgramListSchema.parse(read("programs.json"))["program-list"];
const PAGES = new Map(
  [172, 174, 188].map((id) => [id, AcalogProgramDetailSchema.parse(read(`program-${id}.json`))]),
);

describe("server/programs/snapshot.json", () => {
  const snapshot = programSnapshot();

  it("is valid, strict and for the pinned catalog", () => {
    expect(ProgramSnapshotSchema.safeParse(rawSnapshot).success).toBe(true);
    expect(snapshot.catalogId).toBe(ACALOG_CATALOG.id);
    expect(snapshot.catalogYear).toBe("2026-2027");
    expect(snapshot.programs.length).toBeGreaterThanOrEqual(MIN_PROGRAM_COUNT);
  });

  it("lists exactly the recorded list's public programs, with the same modified stamps", () => {
    const expected = LIST.filter(isPublicProgram).map((item) => ({
      acalogId: item.id,
      legacyId: item["legacy-id"],
      name: item.name,
      modified: item.modified,
    }));
    expect(
      snapshot.programs.map(({ acalogId, legacyId, name, modified }) => ({
        acalogId,
        legacyId,
        name,
        modified,
      })),
    ).toEqual(expected);
  });

  it("agrees with the parser on the recorded program pages (172, 174, 188)", () => {
    const rebuilt = buildSnapshot(
      LIST.filter((item) => PAGES.has(item.id)),
      PAGES,
      snapshot.capturedAt,
    );
    for (const program of rebuilt.programs) {
      const stored = snapshot.programs.find((p) => p.acalogId === program.acalogId);
      expect(stored?.offerings).toEqual(program.offerings);
      expect(stored?.programTypes).toEqual(program.programTypes);
    }
  });

  it("has one official name per offering across the catalog, and majors, minors and interdisciplinary minors", () => {
    const names = snapshot.programs.flatMap((p) => p.offerings.map((o) => programKey(o.name)));
    expect(new Set(names).size).toBe(names.length);
    const kinds = new Set(snapshot.programs.flatMap((p) => p.offerings.map((o) => o.kind)));
    expect([...kinds].sort()).toEqual(["interdisciplinary-minor", "major", "minor"]);
    for (const offering of snapshot.programs.flatMap((p) => p.offerings)) {
      expect(offering.name).toMatch(/^(?:Interdisciplinary )?(?:Major|Minor) in \S/);
      if (offering.kind !== "major") expect(offering.degree).toBeNull();
      if (offering.degree) expect(offering.name).toContain(`(${offering.degree} Degree)`);
    }
  });

  it("buildSnapshot refuses to build without a page for every public program", () => {
    expect(() => buildSnapshot(LIST, PAGES, "2026-09-30")).toThrow(/no program page for 207/);
  });
});
