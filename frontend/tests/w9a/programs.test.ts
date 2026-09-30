import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type * as ProgramsService from "@/server/programs/service";
import { startTestDb, type TestDb } from "../helpers/db";
import { MissingFixtureError } from "@/server/http/fixtures";
import { CAREERS, getCareer } from "@/server/content/careers";

/**
 * Official Acalog names and catalog links for a career's related programs (app/(hub)/careers/_lib/programs.ts),
 * read from the programs service's rows (the checked-in snapshot before any sync; never the network).
 */

const rows = vi.hoisted(() => ({ failure: null as unknown }));
vi.mock("@/server/programs/service", async (importOriginal) => {
  const real = await importOriginal<typeof ProgramsService>();
  return {
    ...real,
    catalogRows: async () => {
      if (rows.failure) throw rows.failure;
      return real.catalogRows();
    },
  };
});

const { fallbackProgramName, loadRelatedPrograms, matchOfferings } =
  await import("@/app/(hub)/careers/_lib/programs");

let db: TestDb;
beforeAll(async () => {
  db = await startTestDb();
});
afterEach(async () => {
  rows.failure = null;
  await db.clear();
});
afterAll(async () => {
  await db.stop();
});

const PUBLIC_PAGE = /^https:\/\/catalog\.davidson\.edu\/preview_program\.php\?catoid=28&poid=\d+$/;

describe("loadRelatedPrograms", () => {
  it("gives Software Engineering its official offering names and catalog pages", async () => {
    const programs = await loadRelatedPrograms(getCareer("software-engineering")!);
    expect(programs.map((p) => p.name)).toEqual([
      "Major in Computer Science (B.S. Degree)",
      "Minor in Computer Science",
      "Minor in Mathematics",
    ]);
    for (const program of programs) {
      expect(program.official).toBe(true);
      expect(program.url).toMatch(PUBLIC_PAGE);
    }
    // Both Computer Science offerings are on one catalog page.
    expect(programs[0]!.url).toBe(programs[1]!.url);
  });

  it("finds an official offering for every related program of every career", async () => {
    for (const career of CAREERS) {
      const programs = await loadRelatedPrograms(career);
      expect(programs.length, career.slug).toBeGreaterThan(0);
      for (const program of programs) {
        expect(program.official, `${career.slug}: ${program.name}`).toBe(true);
        expect(program.url).toMatch(PUBLIC_PAGE);
      }
    }
  });

  it("shows the career's own names without links when the catalog cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    rows.failure = new Error("database down");
    const programs = await loadRelatedPrograms(getCareer("software-engineering")!);
    expect(programs).toEqual([
      { acalogId: 172, name: "Computer Science major", kind: "major", url: null, official: false },
      { acalogId: 172, name: "Computer Science minor", kind: "minor", url: null, official: false },
      { acalogId: 188, name: "Mathematics minor", kind: "minor", url: null, official: false },
    ]);
    expect(log).toHaveBeenCalled();
  });

  it("never hides a missing fixture", async () => {
    rows.failure = new MissingFixtureError("catalog", "GET", "https://catalog.davidson.edu/x");
    await expect(loadRelatedPrograms(getCareer("law")!)).rejects.toBeInstanceOf(
      MissingFixtureError,
    );
  });
});

describe("matchOfferings", () => {
  const program = { name: "Classics", acalogId: 1, type: "major" as const };
  const row = (
    offerings: { kind: "major" | "minor" | "interdisciplinary-minor"; name: string }[],
  ) => ({
    acalogId: 1,
    legacyId: 99,
    name: "Classics",
    offerings: offerings.map((o) => ({ ...o, degree: null })),
  });

  it("uses the offerings of the career's kind", () => {
    expect(
      matchOfferings(program, [
        row([
          { kind: "major", name: "Major in Classics (A.B. Degree)" },
          { kind: "minor", name: "Minor in Classics" },
        ]),
      ]).map((p) => p.name),
    ).toEqual(["Major in Classics (A.B. Degree)"]);
  });

  it("narrows a page with several offerings of the kind to those naming the subject", () => {
    expect(
      matchOfferings({ ...program, type: "minor" }, [
        row([
          { kind: "minor", name: "Minor in Classics" },
          { kind: "minor", name: "Minor in Greek" },
        ]),
      ]).map((p) => p.name),
    ).toEqual(["Minor in Classics"]);
    // Nothing names it: every offering of the kind is listed (each is official).
    expect(
      matchOfferings({ ...program, name: "Ancient Studies" }, [
        row([
          { kind: "major", name: "Major in Classical Studies" },
          { kind: "major", name: "Major in Classical Languages" },
        ]),
      ]).map((p) => p.name),
    ).toEqual(["Major in Classical Studies", "Major in Classical Languages"]);
  });

  it("accepts an interdisciplinary minor for a minor (and the other way round)", () => {
    expect(
      matchOfferings({ ...program, type: "minor" }, [
        row([{ kind: "interdisciplinary-minor", name: "Interdisciplinary Minor in Classics" }]),
      ])[0],
    ).toMatchObject({ name: "Interdisciplinary Minor in Classics", official: true });
  });

  it("names a page of kind other by its catalog heading, offerings or not", () => {
    expect(
      matchOfferings({ name: "Center for Interdisciplinary Studies", acalogId: 1, type: "other" }, [
        { ...row([]), name: "Center for Interdisciplinary Studies" },
      ]),
    ).toEqual([
      {
        acalogId: 1,
        name: "Center for Interdisciplinary Studies",
        kind: "other",
        url: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=99",
        official: true,
      },
    ]);
  });

  it("falls back to the career's own name, without a link, when nothing matches", () => {
    expect(matchOfferings(program, [])).toEqual([
      { acalogId: 1, name: "Classics major", kind: "major", url: null, official: false },
    ]);
    expect(
      matchOfferings(program, [row([{ kind: "minor", name: "Minor in Classics" }])])[0],
    ).toMatchObject({ name: fallbackProgramName(program), official: false });
    expect(fallbackProgramName({ ...program, type: "interdisciplinary-minor" })).toBe(
      "Classics interdisciplinary minor",
    );
  });
});

describe("a program page the catalog no longer lists", () => {
  it("finds the one offering with the same subject and kind elsewhere", () => {
    const rowsNow = [
      {
        acalogId: 213,
        legacyId: 1840,
        name: "Film, Media, and Digital Studies",
        offerings: [
          {
            kind: "major" as const,
            name: "Major in Film, Media, and Digital Studies (A.B. Degree)",
            degree: "A.B.",
          },
          { kind: "minor" as const, name: "Minor in Film and Media Studies", degree: null },
        ],
      },
    ];
    expect(
      matchOfferings(
        { name: "Film and Media Studies", acalogId: 178, type: "interdisciplinary-minor" },
        rowsNow,
      ),
    ).toEqual([
      {
        acalogId: 213,
        name: "Minor in Film and Media Studies",
        kind: "interdisciplinary-minor",
        url: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1840",
        official: true,
      },
    ]);
    // Not the same subject, or not the same kind: no match.
    expect(
      matchOfferings({ name: "Film Studies", acalogId: 178, type: "minor" }, rowsNow)[0]!.official,
    ).toBe(false);
    expect(
      matchOfferings({ name: "Film and Media Studies", acalogId: 178, type: "major" }, rowsNow)[0]!
        .official,
    ).toBe(false);
  });

  it("reads the subject from an official name", async () => {
    const { offeringSubject } = await import("@/app/(hub)/careers/_lib/programs");
    expect(offeringSubject("Major in Computer Science (B.S. Degree)")).toBe("Computer Science");
    expect(offeringSubject("Interdisciplinary Minor in Data Science")).toBe("Data Science");
    expect(
      offeringSubject("Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)"),
    ).toBe("Environmental Studies");
    expect(offeringSubject("Minor in Film and Media Studies")).toBe("Film and Media Studies");
    expect(offeringSubject("Honors in Economics")).toBeNull();
  });
});
