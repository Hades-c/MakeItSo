import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceTag } from "@/lib/sources";
import { programSourceForOffice } from "@/lib/types/content";
import { deadlinesBetween } from "@/server/content/deadlines";
import {
  getOffice,
  getProgram,
  OFFICES,
  OFFICES_VERIFIED_AT,
  programDeadlinesBetween,
  PROGRAMS,
  programsForOffice,
} from "@/server/content/offices";

/** The contracts' index of the 122 verified programs (office, name, URLs, amount, has-deadline). */
const index = JSON.parse(
  readFileSync(new URL("../fixtures/content/office-programs.json", import.meta.url), "utf8"),
) as {
  programs: {
    officeSlug: string;
    name: string;
    url: string;
    sourceUrl: string;
    amount: string | null;
    hasDeadline: boolean;
  }[];
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Programs filed under the office that runs them rather than the office page that lists them (the contracts'
 * index still has the listing office; W4b contractRequest to update tests/fixtures/content/office-programs.json).
 */
const RUN_BY: Readonly<Record<string, string>> = {
  "Greater Charlotte Law School Fair": "matthews-center",
  "Law school application fee grant (Matthews Center professional development funding)":
    "matthews-center",
};

describe("offices and programs", () => {
  it("holds the 20 offices and 122 programs of the verified index, as published", () => {
    expect(OFFICES).toHaveLength(20);
    expect(PROGRAMS).toHaveLength(122);
    expect(PROGRAMS.map((p) => [p.officeSlug, p.name, p.url, p.sources[0], p.amount])).toEqual(
      index.programs.map((p) => [
        RUN_BY[p.name] ?? p.officeSlug,
        p.name,
        p.url,
        p.sourceUrl,
        p.amount,
      ]),
    );
    for (const [name, office] of Object.entries(RUN_BY)) {
      expect(index.programs.find((p) => p.name === name)?.officeSlug).toBe("prelaw");
      expect(PROGRAMS.find((p) => p.name === name)?.officeSlug).toBe(office);
    }
    expect(PROGRAMS.map((p) => p.deadlineText !== null)).toEqual(
      index.programs.map((p) => p.hasDeadline),
    );
    expect(OFFICES_VERIFIED_AT).toBe("2026-09-30");
  });

  it("links each office to exactly its own programs", () => {
    const listed = OFFICES.flatMap((office) => office.programSlugs);
    expect(listed.sort()).toEqual(PROGRAMS.map((p) => p.slug).sort());
    for (const office of OFFICES) {
      for (const program of programsForOffice(office.slug)) {
        expect(program.officeSlug).toBe(office.slug);
      }
      expect(programsForOffice(office.slug)).toHaveLength(office.programSlugs.length);
    }
    expect(programsForOffice("no-such-office")).toEqual([]);
    expect(getOffice("matthews-center")?.name).toMatch(/Matthews Center/);
    expect(getProgram("try-it-fund")?.amount).toBe("up to $1,000");
    expect(getProgram("nope")).toBeUndefined();
  });

  it("tags programs with the office that runs them", () => {
    const count = (tag: string) => PROGRAMS.filter((p) => sourceTag(p.source) === tag).length;
    expect(count("MATTHEWS CENTER")).toBe(32);
    expect(count("HURT HUB PROGRAMS")).toBe(12);
    expect(count("DAVIDSON OFFICES")).toBe(78);
    // The law school fair and fee grant are the Matthews Center's, not Prelaw Advising's.
    expect(getProgram("greater-charlotte-law-school-fair")?.source).toBe("matthews-center");
    expect(
      getProgram("law-school-application-fee-grant-matthews-center-professional-development")
        ?.source,
    ).toBe("matthews-center");
    expect(programsForOffice("prelaw")).toEqual([]);
    expect(getOffice("prelaw")?.services.join(" ")).toMatch(/run by the Matthews Center/);
    for (const program of PROGRAMS) {
      expect(program.source).toBe(programSourceForOffice(program.officeSlug));
    }
  });

  it("keeps amounts and deadline texts verbatim", () => {
    expect(getProgram("nisbet-venture-fund")?.amount).toBe(
      "up to $32,500 in grants and investment ($25,000 Acceleration Track investment structured as a SAFE; $5,000 Incubation Track grant; $2,500 Entrepreneurial Excellence Award)",
    );
    expect(getProgram("davidson-in-washington-diw")?.deadlineText).toBe(
      "Friday, November 6, 2026 by 5 p.m.",
    );
    expect(getProgram("ideasprint")?.deadlines).toEqual([]); // "TBD mid-October 2026"
    expect(getProgram("bonner-scholars-program")?.deadlines).toEqual([]); // opens/review dates only
  });

  it("pins only days its deadline text names", () => {
    let pinned = 0;
    for (const program of PROGRAMS) {
      for (const deadline of program.deadlines) {
        pinned++;
        const [year, month, day] = deadline.date.split("-").map(Number) as [number, number, number];
        const name = MONTHS[month - 1]!;
        const text = program.deadlineText ?? "";
        const named =
          new RegExp(`\\b(${name}|${name.slice(0, 3)}\\.?)\\s+${day}(st|nd|rd|th)?\\b`).test(
            text,
          ) || text.includes(`${month}/${day}/${year}`);
        expect([program.slug, deadline.date, named]).toEqual([program.slug, deadline.date, true]);
        // Pinned inside the 2026-27 cycle, on or after the day the pages were checked.
        expect(deadline.date >= "2026-09-30" && deadline.date <= "2027-08-31").toBe(true);
      }
    }
    expect(pinned).toBe(45);
  });

  it("drops the verifier's internal notes from the texts", () => {
    const texts = [
      ...OFFICES.flatMap((o) => [o.description, ...o.services]),
      ...PROGRAMS.flatMap((p) => [p.description, p.audience ?? "", p.deadlineText ?? ""]),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/calendar\.json|content-prep|\(sic\)|Wildcat Wellness/);
    }
  });

  it("writes deadlines as dates, not 'today' or 'already past'", () => {
    const watson = getProgram("thomas-j-watson-fellowship");
    expect(watson?.description).toMatch(
      /The Davidson nomination deadline is September 30, 2026 at 3 p\.m\. EDT\.$/,
    );
    expect(watson?.deadlines).toEqual([
      { label: "Davidson nomination application (3 p.m. EDT)", date: "2026-09-30" },
    ]);
    const fellowships = getOffice("office-of-fellowships")?.services.join(" ") ?? "";
    expect(fellowships).toMatch(/2026-27 internal deadlines \(3 p\.m\. each\): Fulbright/);
    expect(fellowships).not.toMatch(/already past/);
    expect(getProgram("building-a-lean-startup-course")?.description).not.toMatch(/under way/);
  });

  it("names the CTL's Moodle pages without linking Moodle (PLAN §1)", () => {
    const ctl = getOffice("center-teaching-learning");
    expect(ctl?.services.join(" ")).not.toMatch(/moodle\.davidson\.edu/);
    expect(ctl?.services.join(" ")).toMatch(/CTL Tutor Moodle page \(Davidson login\)/);
  });

  it("cites the Matthews Center pages its office text quotes", () => {
    const sources = getOffice("matthews-center")?.sources ?? [];
    expect(sources[0]).toBe(
      "https://www.davidson.edu/offices-and-services/matthews-center-career-development",
    );
    expect(sources).toEqual(
      expect.arrayContaining([
        // "Knobloch Campus Center, Suite 201"
        "https://www.davidson.edu/offices-and-services/matthews-center-career-development/staff",
        // "we don't use WildcatSync to advertise our events and programs because we use Handshake"
        "https://wildcatsync.davidson.edu/organization/careerdevelopment",
        // "roadmap page: 8:30 a.m.-5 p.m., Monday-Friday"
        "https://www.davidson.edu/offices-and-services/matthews-center-career-development/student-career-planning-roadmap",
      ]),
    );
  });
});

describe("program and combined deadlines", () => {
  it("lists program deadlines on a range of Davidson days", () => {
    const october = programDeadlinesBetween("2026-10-01", "2026-10-06");
    expect(october.map((d) => d.id)).toEqual([
      "program:abernethy-endowment-grant:2026-10-01",
      "program:benjamin-a-gilman-international-scholarship-external-oeaa-advising:2026-10-01",
      "program:dean-rusk-travel-grants:2026-10-01",
      "program:avinger-impact-fund:2026-10-02",
      "program:knight-hennessy-scholars:2026-10-06",
    ]);
    expect(october[3]).toMatchObject({
      kind: "program",
      title: "Avinger Impact Fund",
      label: "Applications close (11:59 p.m.)",
      source: "hurt-hub-programs",
      officeSlug: "hurt-hub",
      endDate: null,
      termCode: null,
    });
    expect(programDeadlinesBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });

  it("merges calendar and program deadlines for Due soon", () => {
    const now = new Date("2026-09-30T12:00:00-04:00");
    const due = deadlinesBetween(now, "2026-10-02");
    expect(due.map((d) => d.id)).toEqual([
      "program:thomas-j-watson-fellowship:2026-09-30",
      "calendar:f26-minor-declaration",
      "program:abernethy-endowment-grant:2026-10-01",
      "program:benjamin-a-gilman-international-scholarship-external-oeaa-advising:2026-10-01",
      "program:dean-rusk-travel-grants:2026-10-01",
      "program:avinger-impact-fund:2026-10-02",
    ]);
    const sources = new Set(deadlinesBetween(now, "2027-06-30").map((d) => d.source));
    expect([...sources].sort()).toEqual([
      "davidson-offices",
      "hurt-hub-programs",
      "matthews-center",
      "registrar",
    ]);
    // Faculty-only calendar rows stay out unless asked for.
    expect(deadlinesBetween("2027-01-05", "2027-01-05").map((d) => d.id)).toEqual([
      "calendar:s27-adddrop-opens",
    ]);
    expect(
      deadlinesBetween("2027-01-05", "2027-01-05", { audience: "all" }).map((d) => d.id),
    ).toContain("calendar:f26-grades-due");
  });
});
