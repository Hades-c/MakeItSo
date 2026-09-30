import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import { AcademicProgramSchema } from "@/lib/types/catalog";
import { MAJORS } from "@/lib/utils";
import Program from "@/models/Program";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http";
import * as programs from "@/server/programs";
import {
  findProgramByName,
  getProgram,
  listPrograms,
  officialProgramNames,
  programNames,
} from "@/server/programs";
import {
  PROGRAM_DETAIL_RETRY_MS,
  PROGRAM_DETAIL_TTL_MS,
  programDetailUrl,
} from "@/server/programs/catalog-info";
import { getProgramWith, type ProgramsDeps } from "@/server/programs/service";
import { programSnapshot } from "@/server/programs/snapshot";
import { type CatalogFetcher, fetchCatalog } from "@/server/programs/upstream";
import { recordedPageJson } from "./recorded";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterEach(async () => {
  await testDb.clear();
});

afterAll(async () => {
  await testDb.stop();
});

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "external", "catalog");
const DAY = 24 * 60 * 60_000;

/** The fixtures-backed fetcher, counting requests; `override` answers chosen URLs instead. */
function counting(override?: (url: string) => Awaited<ReturnType<CatalogFetcher>> | undefined) {
  const urls: string[] = [];
  const fetcher: CatalogFetcher = async (url) => {
    urls.push(url);
    return override?.(url) ?? fetchCatalog(url);
  };
  return { urls, fetcher };
}

function deps(fetcher: CatalogFetcher, at: Date = now()): ProgramsDeps {
  return { fetcher, now: () => at };
}

const WAF = { status: 202, text: "", headers: new Headers({ "x-amzn-waf-action": "challenge" }) };
const MINUTE = 60_000;

/** Answers program pages from the recorded 2026-2027 pages (tests/programs/recorded), counting requests. */
function recordedFetcher() {
  const urls: string[] = [];
  const fetcher: CatalogFetcher = async (url) => {
    urls.push(url);
    const id = Number(/\/program\/(\d+)$/.exec(url)?.[1]);
    return { status: 200, headers: new Headers(), text: recordedPageJson(id) };
  };
  return { urls, fetcher };
}

function pageWith(id: number, patch: (page: Record<string, unknown>) => void) {
  const page = JSON.parse(
    readFileSync(path.join(FIXTURES, `program-${id}.json`), "utf8"),
  ) as Record<string, unknown>;
  patch(page);
  return { status: 200, text: JSON.stringify(page), headers: new Headers() };
}

describe("exports", () => {
  it("are the frozen service surface plus programNames and findProgramByName", () => {
    const functions = Object.entries(programs)
      .filter(([, value]) => typeof value === "function")
      .map(([key]) => key)
      .sort();
    expect(functions).toEqual([
      "findProgramByName",
      "getProgram",
      "listPrograms",
      "officialProgramNames",
      "programNames",
      "syncPrograms",
    ]);
  });
});

describe("before any sync: the checked-in snapshot", () => {
  it("lists every public program, sorted by name, with its offering names", async () => {
    const list = await listPrograms();
    expect(list).toHaveLength(programSnapshot().programs.length);
    expect(list).toHaveLength(51);
    expect(list[0]).toEqual({
      acalogId: 207,
      name: "Africana Studies",
      catalogYear: "2026-2027",
      offerings: [
        { kind: "major", name: "Major in Africana Studies (A.B. Degree)" },
        { kind: "minor", name: "Minor in Africana Studies" },
      ],
    });
    const names = list.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
    // Pages without majors or minors (Humanities, Writing, ...) are still catalog programs.
    expect(list.find((p) => p.name === "Humanities")?.offerings).toEqual([]);
    expect(list.some((p) => p.acalogId === 178)).toBe(false); // hidden in the public catalog
  });

  it("filters by offering kind, keeping only the matching offerings", async () => {
    const majors = await listPrograms({ kinds: ["major"] });
    expect(
      majors.every((p) => p.offerings.length > 0 && p.offerings.every((o) => o.kind === "major")),
    ).toBe(true);
    expect(majors.find((p) => p.name === "Classics")?.offerings.map((o) => o.name)).toEqual([
      "Major in Classical Languages and Literature (A.B. Degree)",
      "Major in Classical Studies (A.B. Degree)",
    ]);
    const minors = await listPrograms({ kinds: ["minor", "interdisciplinary-minor"] });
    expect(minors.some((p) => p.name === "Data Science")).toBe(true);
    expect(minors.some((p) => p.name === "Biology")).toBe(false);
    expect(await listPrograms({ kinds: ["concentration"] })).toEqual([]);
  });

  it("officialProgramNames: sorted, distinct names of one kind", async () => {
    const majors = await officialProgramNames("major");
    expect(majors).toContain("Major in Computer Science (B.S. Degree)");
    expect(majors).toContain(
      "Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)",
    );
    expect(majors).toEqual([...new Set(majors)].sort((a, b) => a.localeCompare(b, "en")));
    expect(await officialProgramNames("interdisciplinary-minor")).toContain(
      "Interdisciplinary Minor in Data Science",
    );
    expect(await officialProgramNames("concentration")).toEqual([]);
  });

  it("programNames: majors, minors (both kinds) and all, for zod enums", async () => {
    const names = await programNames();
    expect(names.catalogYear).toBe("2026-2027");
    expect(names.majors).toEqual(await officialProgramNames("major"));
    expect(names.minors).toContain("Minor in Economics");
    expect(names.minors).toContain("Interdisciplinary Minor in Neuroscience");
    expect(names.all).toHaveLength(names.majors.length + names.minors.length);
  });
});

describe("findProgramByName", () => {
  it("maps the interim sign-up list (lib/utils.ts MAJORS) onto official majors", async () => {
    // Differences with the Acalog catalog (reported to the orchestrator): "Interdisciplinary Studies" (the
    // Center for Interdisciplinary Studies has no major heading), "Genomics, Bioinformatics" (two majors:
    // Bioinformatics and Genomics) and "Undecided" (not a program) resolve to nothing.
    const unresolved = ["Genomics, Bioinformatics", "Interdisciplinary Studies", "Undecided"];
    for (const legacy of MAJORS) {
      const match = await findProgramByName(legacy, { kinds: ["major"] });
      if (unresolved.includes(legacy)) expect(match, legacy).toBeNull();
      else expect(match?.kind, legacy).toBe("major");
    }
    expect(await findProgramByName("French & Francophone Studies")).toEqual({
      acalogId: 179,
      programName: "French and Francophone Studies",
      kind: "major",
      name: "Major in French and Francophone Studies (A.B. Degree)",
      degree: "A.B.",
    });
    expect((await findProgramByName("Classical Languages and Literature"))?.name).toBe(
      "Major in Classical Languages and Literature (A.B. Degree)",
    );
    expect((await findProgramByName("gender and sexuality studies"))?.name).toBe(
      "Major in Gender and Sexuality Studies (A.B. Degree)",
    );
  });

  it("finds minors by name or with a kinds filter", async () => {
    expect((await findProgramByName("Economics minor"))?.name).toBe("Minor in Economics");
    expect(
      (await findProgramByName("Neuroscience", { kinds: ["minor", "interdisciplinary-minor"] }))
        ?.name,
    ).toBe("Interdisciplinary Minor in Neuroscience");
    expect((await findProgramByName("Greek"))?.name).toBe("Minor in Greek");
    expect(await findProgramByName("Neuroscience", { kinds: ["major"] })).toBeNull();
    expect(await findProgramByName("x".repeat(500))).toBeNull();
  });

  it("never turns a name of one kind into another kind", async () => {
    for (const input of [
      "Physics minor",
      "Minor in Biology",
      "Biology minor",
      "Chemistry minor",
      "Political Science minor",
      "Psychology minor",
      "Sociology minor",
    ]) {
      expect(await findProgramByName(input), input).toBeNull();
    }
    expect(await findProgramByName("Minor in Economics", { kinds: ["major"] })).toBeNull();
    expect(
      await findProgramByName("Major in Economics (A.B. Degree)", { kinds: ["minor"] }),
    ).toBeNull();
    expect((await findProgramByName("Physics"))?.name).toBe("Major in Physics (B.S. Degree)");
    expect((await findProgramByName("Astrophysics minor"))?.name).toBe("Minor in Astrophysics");
  });

  it("tolerates punctuation around kind and degree words", async () => {
    const cases: [string, string][] = [
      ["Economics (minor)", "Minor in Economics"],
      ["Minor: Economics", "Minor in Economics"],
      ["Major - Computer Science", "Major in Computer Science (B.S. Degree)"],
      ["Computer Science (B.S.)", "Major in Computer Science (B.S. Degree)"],
      ["Computer Science, B.S.", "Major in Computer Science (B.S. Degree)"],
      ["B.S. in Computer Science", "Major in Computer Science (B.S. Degree)"],
      [
        "Environmental Studies (B.A.)",
        "Interdisciplinary Major in Environmental Studies (B.A. or B.S. Degree)",
      ],
    ];
    for (const [input, name] of cases)
      expect((await findProgramByName(input))?.name, input).toBe(name);
  });
});

describe("getProgram (lazy program pages, cached 7 days)", () => {
  it("reads a page on first request, stores it, and serves the copy until it is 7 days old", async () => {
    const { urls, fetcher } = counting();
    const t0 = now();
    const first = await getProgramWith(172, deps(fetcher, t0));
    expect(urls).toEqual(["https://catalog.davidson.edu/widget-api/catalog/4/program/172"]);
    expect(AcademicProgramSchema.parse(first)).toEqual(first);
    expect(first).toMatchObject({
      acalogId: 172,
      catalogId: 4,
      catalogYear: "2026-2027",
      name: "Computer Science",
      url: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1799",
      fetchedAt: t0.toISOString(),
    });
    expect(first?.offerings.map((o) => o.name)).toEqual([
      "Major in Computer Science (B.S. Degree)",
      "Minor in Computer Science",
    ]);
    expect(first?.offerings[0]?.requirementsText).toMatch(
      /^Major in Computer Science \(B\.S\. Degree\)\nMajor Prerequisites:/,
    );

    const cached = await getProgramWith(172, deps(fetcher, new Date(t0.getTime() + 6 * DAY)));
    expect(urls).toHaveLength(1);
    expect(cached).toEqual(first);

    const later = new Date(t0.getTime() + PROGRAM_DETAIL_TTL_MS + 1);
    const refreshed = await getProgramWith(172, deps(fetcher, later));
    expect(urls).toHaveLength(2);
    expect(refreshed?.fetchedAt).toBe(later.toISOString());
  });

  it("keeps serving the last good copy when a refresh fails, and records the error", async () => {
    const t0 = now();
    await getProgramWith(174, deps(counting().fetcher, t0));
    const later = new Date(t0.getTime() + 8 * DAY);
    const stale = await getProgramWith(
      174,
      deps(async () => WAF, later),
    );
    expect(stale?.fetchedAt).toBe(t0.toISOString());
    const doc = await Program.findOne({ acalogId: 174 }).lean();
    expect(doc?.lastDetailError).toMatch(/bot challenge/);
    expect(doc?.lastDetailErrorAt?.toISOString()).toBe(later.toISOString());
  });

  it("answers 503 for a never-read page Acalog cannot serve, without changing the program list", async () => {
    const error = await getProgramWith(
      188,
      deps(async () => WAF),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: "unavailable" });
    expect((await Program.findOne({ acalogId: 188 }).lean())?.lastDetailError).toMatch(/challenge/);
    expect(await listPrograms()).toHaveLength(51);
  });

  it("returns null for ids the catalog does not list, without calling Acalog", async () => {
    const { urls, fetcher } = counting();
    expect(await getProgramWith(999_999, deps(fetcher))).toBeNull();
    expect(await getProgramWith(178, deps(fetcher))).toBeNull(); // hidden program
    expect(await getProgramWith(0, deps(fetcher))).toBeNull();
    expect(await getProgramWith(Number.NaN, deps(fetcher))).toBeNull();
    expect(urls).toEqual([]);
  });

  it("reads a page once for concurrent requests", async () => {
    const { urls, fetcher } = counting();
    const results = await Promise.all([
      getProgramWith(174, deps(fetcher)),
      getProgramWith(174, deps(fetcher)),
      getProgramWith(174, deps(fetcher)),
    ]);
    expect(urls).toHaveLength(1);
    expect(results.map((r) => r?.name)).toEqual(["Economics", "Economics", "Economics"]);
  });

  it("rejects a page that suddenly lists no offerings, or is hidden", async () => {
    const empty = counting(() => pageWith(172, (page) => (page.cores = [])));
    await expect(getProgramWith(172, deps(empty.fetcher))).rejects.toMatchObject({ status: 503 });
    expect((await Program.findOne({ acalogId: 172 }).lean())?.lastDetailError).toMatch(
      /lists no majors or minors \(the last good copy had 2\)/,
    );
    const hidden = counting(() =>
      pageWith(174, (page) => (page.status = { active: true, visible: false })),
    );
    await expect(getProgramWith(174, deps(hidden.fetcher))).rejects.toMatchObject({ status: 503 });
  });

  it("uses a read page's offerings in the list from then on", async () => {
    const renamed = counting(() =>
      pageWith(174, (page) => {
        const cores = page.cores as { name: string }[];
        if (cores[0]) cores[0].name = "Major Requirements (B.S. Degree)";
      }),
    );
    await getProgramWith(174, deps(renamed.fetcher));
    const economics = (await listPrograms()).find((p) => p.acalogId === 174);
    expect(economics?.offerings.map((o) => o.name)).toEqual([
      "Major in Economics (B.S. Degree)",
      "Minor in Economics",
    ]);
    expect(await listPrograms()).toHaveLength(51);
  });

  it("does not ask Acalog again for a while after a failed read (stale copy, or 503 with Retry-After)", async () => {
    const t0 = now();
    await getProgramWith(174, deps(counting().fetcher, t0));
    const failing = counting(() => WAF);
    const stale = new Date(t0.getTime() + 8 * DAY);
    await getProgramWith(174, deps(failing.fetcher, stale));
    expect(failing.urls).toHaveLength(1);
    for (let i = 1; i <= 5; i++) {
      const again = await getProgramWith(
        174,
        deps(failing.fetcher, new Date(stale.getTime() + i * MINUTE)),
      );
      expect(again?.fetchedAt).toBe(t0.toISOString());
    }
    expect(failing.urls).toHaveLength(1);
    await getProgramWith(
      174,
      deps(failing.fetcher, new Date(stale.getTime() + PROGRAM_DETAIL_RETRY_MS)),
    );
    expect(failing.urls).toHaveLength(2);

    // A page never read: 503 with Retry-After, and no new request until the wait is over.
    const never = counting(() => WAF);
    await expect(getProgramWith(188, deps(never.fetcher, t0))).rejects.toMatchObject({
      status: 503,
      headers: { "Retry-After": String(PROGRAM_DETAIL_RETRY_MS / 1000) },
    });
    const error = await getProgramWith(
      188,
      deps(never.fetcher, new Date(t0.getTime() + 10 * MINUTE)),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 503, headers: { "Retry-After": String(20 * 60) } });
    expect(never.urls).toHaveLength(1);
    const ok = counting();
    const read = await getProgramWith(188, deps(ok.fetcher, new Date(t0.getTime() + 31 * MINUTE)));
    expect(read?.name).toBe("Mathematics");
    expect(ok.urls).toHaveLength(1);
  });

  it("stores the page's other sections and the offerings it states for other pages", async () => {
    const { fetcher } = recordedFetcher();
    await getProgramWith(213, deps(fetcher));
    const doc = await Program.findOne({ acalogId: 213 }).lean();
    expect(doc?.pageSections.map((section) => section.heading)).toEqual([
      "Honors Requirements",
      "Digital Studies Minor Requirements",
      "Course Numbering Rationale",
    ]);
    expect(doc?.elsewhereOfferings).toEqual([
      expect.objectContaining({
        family: "minor",
        subjectKey: "digital studies",
        name: "Minor in Digital Studies",
      }),
    ]);
    // Heading-only sections (the statement is the heading) are stored with empty text.
    await getProgramWith(210, deps(fetcher));
    const eas = await Program.findOne({ acalogId: 210 }).lean();
    expect(eas?.offerings[1]?.sections).toContainEqual({
      heading: "(3) An international Experience in East Asia of at least one month's duration",
      text: "",
    });
    // List reads leave the text out.
    expect((await listPrograms()).find((p) => p.acalogId === 213)?.offerings).toHaveLength(2);
  });

  it("shows another page's statement of an offering next to this page's, and logs the difference once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { urls, fetcher } = recordedFetcher();
    const digital = await getProgramWith(211, deps(fetcher));
    // The Digital Studies page (211) is restated by the FMDS page (213), which is read with it.
    expect(urls).toEqual([programDetailUrl(211), programDetailUrl(213)]);
    const text = digital?.offerings[0]?.requirementsText ?? "";
    expect(text).toContain(
      "The Digital Studies Interdisciplinary minor requires six courses, including an introductory class",
    );
    expect(text).toContain("Also described on the Film, Media, and Digital Studies page\n");
    expect(text).toContain(
      "The Film, Media, and Digital Studies page of the 2026-2027 catalog (updated 2026-08-19) also describes this minor; this page (updated 2026-06-08) is the one above.",
    );
    expect(text).toContain("And 5 electives from this list, including one 300 or 400-level class");
    expect(text.indexOf("Also described on")).toBeGreaterThan(
      text.indexOf("Application Procedure"),
    );
    expect(
      warn.mock.calls.filter(([message]) => String(message).includes("also described")),
    ).toHaveLength(1);

    await getProgramWith(211, deps(fetcher));
    expect(urls).toHaveLength(2); // both pages cached
    expect(
      warn.mock.calls.filter(([message]) => String(message).includes("also described")),
    ).toHaveLength(1);
    warn.mockRestore();

    // Pages nobody restates get no note and no extra read.
    const plain = counting();
    const cs = await getProgramWith(172, deps(plain.fetcher));
    expect(plain.urls).toEqual([programDetailUrl(172)]);
    expect(cs?.offerings[0]?.requirementsText).not.toContain("Also described on");
  });

  it("getProgram uses fetchExternal (fixtures in tests)", async () => {
    expect((await getProgram(188))?.offerings.map((o) => o.name)).toEqual([
      "Major in Mathematics (B.S. Degree)",
      "Minor in Mathematics",
    ]);
  });
});
