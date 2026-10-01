import { describe, expect, it } from "vitest";
import { item } from "./factories";
import type { ReqCode } from "@/lib/types/catalog";
import {
  PlanProgressSchema,
  REQUIREMENT_SLOTS,
  type PlanItem,
  type PlanView,
} from "@/lib/types/plan";
import { REQUIREMENTS_DISCLAIMER } from "@/server/content/requirements";
import {
  evaluateRequirements,
  isCompMet,
  isPreMatriculation,
  slotStatusOf,
} from "@/server/plan/requirements";

/**
 * The requirements engine (PLAN §5 "Credits & requirements"), table-tested. Default student: started Fall 2024
 * (catalog 2024-2025, which has no verified edition: the nearest, 2025-2026, applies), today 2026-09-30 in
 * Fall 2026, so the first year (through Spring 2025) is over.
 */

const NOW = new Date("2026-09-30T16:00:00Z");
const NO_MANUAL: PlanView["manual"] = {
  languageExempt: false,
  pe: { lifetimeActivities: 0, teamSport: false },
};

function evaluate(
  items: PlanItem[],
  options: { firstTerm?: string; manual?: PlanView["manual"]; currentTerm?: string } = {},
) {
  const report = evaluateRequirements({
    items,
    manual: options.manual ?? NO_MANUAL,
    firstTerm: options.firstTerm ?? "202401",
    now: NOW,
    currentTerm: options.currentTerm ?? "202601",
  });
  PlanProgressSchema.parse(report);
  return report;
}

const tagged = (courseCode: string, reqCodes: ReqCode[], extra: Partial<PlanItem> = {}) =>
  item({ courseCode, reqCodes, ...extra });

const codesOf = (report: ReturnType<typeof evaluate>) => report.warnings.map((w) => w.code);

describe("output shape", () => {
  it("covers every slot, requires 32, and always carries the disclaimer", () => {
    const report = evaluate([]);
    expect(Object.keys(report.reqs).sort()).toEqual([...REQUIREMENT_SLOTS].sort());
    expect(Object.values(report.reqs).every((status) => status === "open")).toBe(true);
    expect(report).toMatchObject({
      creditsDone: 0,
      creditsPlanned: 0,
      required: 32,
      filledBy: {},
      disclaimer: "Unofficial — verify in Degree Works",
    });
    expect(report.disclaimer).toBe(REQUIREMENTS_DISCLAIMER);
  });

  it("maps statuses to slot statuses", () => {
    expect(slotStatusOf("completed")).toBe("done");
    expect(slotStatusOf("in-progress")).toBe("this-term");
    expect(slotStatusOf("registered")).toBe("this-term");
    expect(slotStatusOf("planned")).toBe("planned");
    for (const status of ["failed", "dropped", "withdrawn"] as const) {
      expect(slotStatusOf(status)).toBe("open");
    }
  });

  it("is keyed by the catalog year of the first term", () => {
    expect(evaluate([], { firstTerm: "202601" })).toMatchObject({
      catalogYear: "2026-2027",
      rulesExact: true,
    });
    expect(evaluate([], { firstTerm: "202501" })).toMatchObject({
      catalogYear: "2025-2026",
      rulesExact: true,
    });
    // No verified edition: the nearest one applies, flagged as not exact.
    expect(evaluate([], { firstTerm: "202401" })).toMatchObject({
      catalogYear: "2025-2026",
      rulesExact: false,
    });
    expect(evaluate([], { firstTerm: "202801" })).toMatchObject({
      catalogYear: "2026-2027",
      rulesExact: false,
    });
  });

  it("is deterministic whatever the input order", () => {
    const items = [
      tagged("HUM 104", ["COMP", "HTRQ", "LTRQ"]),
      tagged("HIS 233", ["HTRQ"]),
      tagged("ENG 110", ["LTRQ"], { status: "planned", termCode: "202602" }),
      tagged("SPA 343", ["CULT", "FRLG", "JEC", "LTRQ"]),
      tagged("AFR 130", ["JEC", "LTRQ"], { status: "in-progress", termCode: "202601" }),
      tagged("ECO 101", ["SSRQ"]),
      tagged("EDU 330", ["JEC", "SSRQ"], { status: "planned", termCode: "202602" }),
    ];
    const forward = evaluate(items);
    const backward = evaluate([...items].reverse());
    expect(backward).toEqual(forward);
  });
});

describe("(a) credits", () => {
  it.each([
    ["a completed course", [item({ courseCode: "CSC 121" })], 1, 1],
    ["a Pass (completed P/F) course", [item({ courseCode: "CSC 121", passFail: true })], 1, 1],
    ["an F or Fail (failed)", [item({ courseCode: "CSC 121", status: "failed" })], 0, 0],
    ["a W (withdrawn)", [item({ courseCode: "CSC 121", status: "withdrawn" })], 0, 0],
    ["a dropped course", [item({ courseCode: "CSC 121", status: "dropped" })], 0, 0],
    ["a course in progress", [item({ courseCode: "CSC 121", status: "in-progress" })], 0, 1],
    ["a registered course", [item({ courseCode: "CSC 121", status: "registered" })], 0, 1],
    ["a planned course", [item({ courseCode: "CSC 121", status: "planned" })], 0, 1],
    ["a 0-credit ensemble", [item({ courseCode: "MUS 012", credits: 0 })], 0, 0],
    ["HUM 103 (2 credits)", [item({ courseCode: "HUM 103", credits: 2 })], 2, 2],
  ])("counts %s", (_label, items, done, planned) => {
    expect(evaluate(items)).toMatchObject({ creditsDone: done, creditsPlanned: planned });
  });

  it("lets 0-credit courses fill no slot, whatever they are tagged", () => {
    const report = evaluate([tagged("MUS 055", ["VPRQ", "CULT", "COMP"], { credits: 0 })]);
    expect(report.reqs).toMatchObject({ VPRQ: "open", CULT: "open", COMP: "open" });
  });

  it("counts at most four pre-matriculation credits, with a residence note", () => {
    const ap = (code: string) => item({ courseCode: code, termCode: null, source: "ap" });
    const report = evaluate([
      ap("MAT 110"),
      ap("ECO 101"),
      ap("PSY 101"),
      ap("BIO 111"),
      ap("CHE 115"),
      ap("ENG 110"),
      item({ courseCode: "CSC 121" }),
    ]);
    expect(report.creditsDone).toBe(5);
    expect(report.creditsPlanned).toBe(5);
    const note = report.warnings.find((w) => w.code === "residence-note");
    expect(note?.message).toContain("At least 16 of the 32 courses must be taken in residence");
    expect(note?.message).toContain("including the final 7");
    expect(note?.message).toContain("Only 4 credits from before matriculation count");
  });

  it("adds the residence note only when AP or transfer credit is listed", () => {
    expect(codesOf(evaluate([item({ courseCode: "CSC 121" })]))).not.toContain("residence-note");
    expect(
      codesOf(evaluate([item({ courseCode: "CSC 121", source: "transfer", termCode: "202503" })])),
    ).toContain("residence-note");
  });
});

describe("(b) writing", () => {
  it.each([
    ["WRI 101", tagged("WRI 101", ["COMP"]), "done"],
    ["HUM 104", tagged("HUM 104", ["COMP", "HTRQ", "LTRQ"]), "done"],
    ["WRI 101 in progress", tagged("WRI 101", ["COMP"], { status: "in-progress" }), "this-term"],
    ["WRI 101 planned", tagged("WRI 101", ["COMP"], { status: "planned" }), "planned"],
    ["AP credit", tagged("WRI 101", ["COMP"], { source: "ap", termCode: null }), "open"],
    ["transfer credit", tagged("WRI 101", ["COMP"], { source: "transfer" }), "open"],
    ["a failed WRI 101", tagged("WRI 101", ["COMP"], { status: "failed" }), "open"],
  ] as const)("%s → COMP %s", (_label, entry, status) => {
    expect(evaluate([entry]).reqs.COMP).toBe(status);
  });

  const firstYear = { firstTerm: "202601", currentTerm: "202601" };

  it("reminds a first-year until writing is done or planned within the first year", () => {
    const none = evaluate([], firstYear);
    expect(none.warnings).toContainEqual({
      code: "writing-not-done-first-year",
      message:
        "Complete the writing requirement (WRI 101 or HUM 104) by the end of your first year (Spring 2027).",
    });
    const inTime = evaluate(
      [tagged("WRI 101", ["COMP"], { status: "planned", termCode: "202602" })],
      firstYear,
    );
    expect(codesOf(inTime)).not.toContain("writing-not-done-first-year");
    const late = evaluate(
      [tagged("WRI 101", ["COMP"], { status: "planned", termCode: "202701" })],
      firstYear,
    );
    expect(codesOf(late)).toContain("writing-not-done-first-year");
  });

  it("warns that writing is overdue after the first year, unless it is under way", () => {
    const overdue = evaluate([
      tagged("WRI 101", ["COMP"], { status: "planned", termCode: "202602" }),
    ]);
    expect(overdue.warnings).toContainEqual({
      code: "writing-not-done-first-year",
      message:
        "The writing requirement (WRI 101 or HUM 104) was due by the end of your first year (Spring 2025). Complete it as soon as you can.",
    });
    const underway = evaluate([
      tagged("WRI 101", ["COMP"], { status: "in-progress", termCode: "202601" }),
    ]);
    expect(codesOf(underway)).not.toContain("writing-not-done-first-year");
    expect(codesOf(evaluate([tagged("WRI 101", ["COMP"])]))).not.toContain(
      "writing-not-done-first-year",
    );
  });

  it("isCompMet: completed COMP, not AP/transfer; in progress only before the target term", () => {
    expect(isCompMet([tagged("WRI 101", ["COMP"])])).toBe(true);
    expect(isCompMet([tagged("WRI 101", ["COMP"], { source: "ap", termCode: null })])).toBe(false);
    const current = tagged("WRI 101", ["COMP"], { status: "in-progress", termCode: "202601" });
    expect(isCompMet([current])).toBe(false);
    expect(isCompMet([current], "202602")).toBe(true);
    expect(isCompMet([current], "202601")).toBe(false);
  });
});

describe("(c) Ways of Knowing", () => {
  it("HUM 104 (COMP + HTRQ + LTRQ) fills COMP and ONE Way of Knowing; the other is 'also tagged'", () => {
    const hum = tagged("HUM 104", ["COMP", "HTRQ", "LTRQ"]);
    const report = evaluate([hum]);
    expect(report.reqs).toMatchObject({ COMP: "done", LTRQ: "done", HTRQ: "open" });
    expect(report.filledBy).toMatchObject({ COMP: [hum.id], LTRQ: [hum.id] });
    expect(report.alsoTagged).toEqual({ [hum.id]: ["HTRQ"] });
  });

  it("maximum matching: HUM 104 moves to LTRQ when a history course needs HTRQ", () => {
    const hum = tagged("HUM 104", ["COMP", "HTRQ", "LTRQ"]);
    const history = tagged("HIS 233", ["HTRQ"]);
    const report = evaluate([hum, history]);
    expect(report.reqs).toMatchObject({ COMP: "done", LTRQ: "done", HTRQ: "done" });
    expect(report.filledBy).toMatchObject({ LTRQ: [hum.id], HTRQ: [history.id] });
    expect(report.alsoTagged).toEqual({ [hum.id]: ["HTRQ"] });
  });

  it("each course fills at most one slot, and a flexible course is re-routed to fill more", () => {
    const flexible = tagged("ENG 201", ["LTRQ", "HTRQ"], { termCode: "202402" });
    const narrow = tagged("ENG 110", ["LTRQ"], { termCode: "202501" });
    const report = evaluate([flexible, narrow]);
    expect(report.filledBy).toMatchObject({ LTRQ: [narrow.id], HTRQ: [flexible.id] });
  });

  it("tie-break: the courses with the fewest alternative tags fill the slots", () => {
    const x = tagged("ECO 101", ["SSRQ"]);
    const y = tagged("PSY 101", ["SSRQ", "MQRQ"]);
    const z = tagged("MAT 110", ["MQRQ"]);
    const report = evaluate([y, z, x]);
    expect(report.filledBy).toMatchObject({ SSRQ: [x.id], MQRQ: [z.id] });
    expect(report.alsoTagged[y.id]).toEqual(["SSRQ", "MQRQ"]);
  });

  it("prefers completed work, then work in progress, then plans, for the same slot", () => {
    const planned = tagged("ECO 202", ["SSRQ"], { status: "planned", termCode: "202602" });
    const current = tagged("POL 121", ["SSRQ"], { status: "in-progress", termCode: "202601" });
    const done = tagged("SOC 101", ["SSRQ"], { termCode: "202501" });
    expect(evaluate([planned, current, done]).filledBy.SSRQ).toEqual([done.id]);
    expect(evaluate([planned, current]).reqs.SSRQ).toBe("this-term");
    expect(evaluate([planned]).reqs.SSRQ).toBe("planned");
  });

  it("fills more slots before preferring done work (a done course moves aside for a plan)", () => {
    const done = tagged("AFR 251", ["HTRQ", "SSRQ"]);
    const planned = tagged("ECO 101", ["SSRQ"], { status: "planned", termCode: "202602" });
    const report = evaluate([done, planned]);
    expect(report.reqs).toMatchObject({ HTRQ: "done", SSRQ: "planned" });
  });

  it("NONE fills nothing; NSCI (legacy) fills nothing and asks to verify", () => {
    const none = tagged("MIL 101", ["NONE"]);
    const nsci = tagged("PHY 395", ["NSCI"], { termCode: "202501" });
    const report = evaluate([none, nsci]);
    expect(report.reqs.NSRQ).toBe("open");
    expect(report.warnings).toContainEqual({
      code: "nsci-verify",
      message:
        "PHY 395 carries the legacy NSCI tag: verify in Degree Works whether it counts for Natural Science.",
      itemId: nsci.id,
      termCode: "202501",
    });
    expect(codesOf(report)).not.toContain("no-requirement-data");
  });

  it("allows at most two pre-matriculation credits in Ways of Knowing", () => {
    const ap = (code: string, codes: ReqCode[]) =>
      item({ courseCode: code, reqCodes: codes, termCode: null, source: "ap" });
    const report = evaluate([
      ap("ENG 110", ["LTRQ"]),
      ap("HIS 124", ["HTRQ"]),
      ap("ECO 101", ["SSRQ"]),
    ]);
    const filled = ["LTRQ", "HTRQ", "SSRQ"].filter(
      (slot) => report.reqs[slot as "LTRQ"] === "done",
    );
    expect(filled).toHaveLength(2);
    // Transfer credit taken after matriculation is not pre-matriculation.
    const later = evaluate([
      ap("ENG 110", ["LTRQ"]),
      ap("HIS 124", ["HTRQ"]),
      item({ courseCode: "ECO 101", reqCodes: ["SSRQ"], source: "transfer", termCode: "202503" }),
    ]);
    expect(later.reqs).toMatchObject({ LTRQ: "done", HTRQ: "done", SSRQ: "done" });
  });

  it("chooses which two pre-matriculation credits count so the most slots are filled", () => {
    const ap = (code: string, codes: ReqCode[]) =>
      item({ courseCode: code, reqCodes: codes, termCode: null, source: "ap" });
    const report = evaluate([
      ap("ENG 110", ["LTRQ"]),
      ap("HIS 124", ["HTRQ"]),
      ap("ECO 101", ["SSRQ"]),
      tagged("ENG 201", ["LTRQ"]),
      tagged("HIS 233", ["HTRQ"]),
    ]);
    expect(report.reqs).toMatchObject({ LTRQ: "done", HTRQ: "done", SSRQ: "done" });
  });

  it("isPreMatriculation: AP/transfer before the first term or without one", () => {
    const first = "202401";
    expect(isPreMatriculation({ source: "ap", termCode: null }, first)).toBe(true);
    expect(isPreMatriculation({ source: "transfer", termCode: "202303" }, first)).toBe(true);
    expect(isPreMatriculation({ source: "transfer", termCode: "202403" }, first)).toBe(false);
    expect(isPreMatriculation({ source: "catalog", termCode: null }, first)).toBe(false);
  });
});

describe("(d) CULT and JEC", () => {
  it("JEC may overlap a Way of Knowing", () => {
    const edu = tagged("EDU 330", ["JEC", "SSRQ"]);
    const report = evaluate([edu]);
    expect(report.reqs).toMatchObject({ JEC: "done", SSRQ: "done" });
    expect(report.filledBy).toMatchObject({ JEC: [edu.id], SSRQ: [edu.id] });
  });

  it("one course fills CULT or JEC, not both; a second course takes the other", () => {
    const spa = tagged("SPA 343", ["CULT", "FRLG", "JEC", "LTRQ"]);
    const alone = evaluate([spa]);
    expect([alone.reqs.CULT, alone.reqs.JEC].sort()).toEqual(["done", "open"]);
    expect(alone.reqs).toMatchObject({ FRLG: "done", LTRQ: "done" });
    const afr = tagged("AFR 130", ["JEC", "LTRQ"], { status: "planned", termCode: "202602" });
    const both = evaluate([spa, afr]);
    expect(both.filledBy).toMatchObject({ CULT: [spa.id], JEC: [afr.id] });
    expect(both.reqs).toMatchObject({ CULT: "done", JEC: "planned" });
  });

  it("uses the codes of the listing registered under (EDU 330 JEC vs SOC 330 CULT)", () => {
    // The same class, cross-listed: EDU 330 A carries JEC + SSRQ, SOC 330 A carries CULT + SSRQ.
    const asEdu = tagged("EDU 330", ["JEC", "SSRQ"], { canonicalCode: "EDU 330" });
    const asSoc = tagged("SOC 330", ["CULT", "SSRQ"], { canonicalCode: "EDU 330" });
    expect(evaluate([asEdu]).reqs).toMatchObject({ JEC: "done", CULT: "open" });
    expect(evaluate([asSoc]).reqs).toMatchObject({ JEC: "open", CULT: "done" });
  });
});

describe("one course, one count (credit is received only once for a course)", () => {
  const hum104 = (termCode: string, status: PlanItem["status"]) =>
    item({
      courseCode: "HUM 104",
      title: "Connections and Conflicts II",
      credits: 1,
      termCode,
      status,
      reqCodes: ["COMP", "HTRQ", "LTRQ"],
    });

  it("a retake of HUM 104 (COMP+HTRQ+LTRQ) fills one Ways of Knowing slot and counts one credit", () => {
    const first = hum104("202402", "completed");
    const retake = hum104("202602", "planned");
    const report = evaluate([retake, first]);
    const wok = (["HTRQ", "LTRQ"] as const).filter((slot) => report.reqs[slot] !== "open");
    expect(wok).toHaveLength(1);
    expect(report.reqs[wok[0]!]).toBe("done");
    expect(report.filledBy[wok[0]!]).toEqual([first.id]);
    expect(report.reqs.COMP).toBe("done");
    expect(report).toMatchObject({ creditsDone: 1, creditsPlanned: 1 });
    expect(report.warnings).toContainEqual({
      code: "already-completed",
      message:
        "HUM 104 (Spring 2027) is completed in Spring 2025: credit is received only once for a course, so it counts once. If it may be repeated for credit, verify in Degree Works.",
      itemId: retake.id,
      termCode: "202602",
    });
  });

  it.each([
    [
      "the same course planned in two terms",
      [
        tagged("HIS 184", ["CULT", "HTRQ"], {
          title: "Modern Africa",
          termCode: "202602",
          status: "planned",
        }),
        tagged("HIS 184", ["CULT", "HTRQ"], {
          title: "Modern Africa",
          termCode: "202701",
          status: "planned",
        }),
      ],
      { creditsPlanned: 1, repeats: 1 },
    ],
    [
      "cross-listed siblings with different codes (EDU 330 / SOC 330)",
      [
        item({
          courseCode: "EDU 330",
          canonicalCode: "EDU 330",
          title: "Sociology of Education",
          termCode: "202501",
          reqCodes: ["JEC", "SSRQ"],
        }),
        item({
          courseCode: "SOC 330",
          canonicalCode: "EDU 330",
          title: "Sociology of Education",
          termCode: "202601",
          status: "planned",
          reqCodes: ["CULT", "SSRQ"],
        }),
      ],
      { creditsPlanned: 1, repeats: 1 },
    ],
    [
      "a topics course planned twice without a section",
      [
        item({
          courseCode: "WRI 101",
          title: "Writing Program: topics vary by section",
          termCode: "202602",
          status: "planned",
        }),
        item({
          courseCode: "WRI 101",
          title: "Writing Program: topics vary by section",
          termCode: "202701",
          status: "planned",
        }),
      ],
      { creditsPlanned: 2, repeats: 0 },
    ],
    [
      "a topics course with different section titles",
      [
        item({ courseCode: "ENG 110", title: "Monsters", termCode: "202501" }),
        item({ courseCode: "ENG 110", title: "Road Trips", termCode: "202502" }),
      ],
      { creditsPlanned: 2, repeats: 0 },
    ],
    [
      "a 0-credit ensemble every term",
      [
        item({ courseCode: "MUS 012", title: "Chorale", credits: 0, termCode: "202501" }),
        item({ courseCode: "MUS 012", title: "Chorale", credits: 0, termCode: "202502" }),
      ],
      { creditsPlanned: 0, repeats: 0 },
    ],
    [
      "a failed attempt and its retake",
      [
        item({ courseCode: "CSC 121", title: "Programming", termCode: "202501", status: "failed" }),
        item({ courseCode: "CSC 121", title: "Programming", termCode: "202502" }),
      ],
      { creditsPlanned: 1, repeats: 0 },
    ],
  ] as const)("%s", (_name, items, expected) => {
    const report = evaluate([...items]);
    expect(report.creditsPlanned).toBe(expected.creditsPlanned);
    expect(report.warnings.filter((w) => w.code === "already-completed")).toHaveLength(
      expected.repeats,
    );
  });

  it("a course counted once fills CULT or JEC once, never one with each copy", () => {
    const report = evaluate([
      tagged("SPA 343", ["CULT", "JEC"], { title: "Spanish Civil War", termCode: "202501" }),
      tagged("SPA 343", ["CULT", "JEC"], {
        title: "Spanish Civil War",
        termCode: "202601",
        status: "planned",
      }),
    ]);
    expect([report.reqs.CULT, report.reqs.JEC].sort()).toEqual(["done", "open"]);
  });
});

describe("(e) language and (f) PE", () => {
  it("FRLG: a tagged course, or the proficiency/exemption toggle", () => {
    expect(evaluate([tagged("SPA 201", ["FRLG"], { status: "planned" })]).reqs.FRLG).toBe(
      "planned",
    );
    expect(evaluate([], { manual: { ...NO_MANUAL, languageExempt: true } }).reqs.FRLG).toBe("done");
    // The Self-Instructional Language Program never satisfies it.
    expect(evaluate([tagged("SIL 201", ["FRLG"])]).reqs.FRLG).toBe("open");
  });

  it.each([
    // A Davidson language (rules.language.languages) at 201 or higher.
    ["SPA 201", {}, "done"],
    ["ARB 395", {}, "done"],
    ["LAT 224", {}, "done"],
    ["GER 398", {}, "done"],
    ["SPA 201", { source: "transfer" as const, termCode: null }, "done"],
    // Below the third-semester level.
    ["SPA 101", {}, "open"],
    ["FRE 102", {}, "open"],
    // Not a Davidson language: live data has MUS 055 A (CRN 20546, Spring 2026) tagged FRLG (0 credits there).
    ["MUS 055", { credits: 1 }, "open"],
    ["HEB 201", {}, "open"],
    // The tag is still required.
    ["SPA 202", { reqCodes: ["LTRQ"] as ReqCode[] }, "open"],
  ] as const)("FRLG %s %j → %s", (courseCode, extra, status) => {
    const report = evaluate([tagged(courseCode, ["FRLG"], { ...extra })]);
    expect(report.reqs.FRLG).toBe(status);
  });

  it.each([
    [{ lifetimeActivities: 2, teamSport: true }, "done"],
    [{ lifetimeActivities: 1, teamSport: true }, "open"],
    [{ lifetimeActivities: 2, teamSport: false }, "open"],
    [{ lifetimeActivities: 0, teamSport: false }, "open"],
  ] as const)("PE checklist %j → %s", (pe, status) => {
    expect(evaluate([], { manual: { languageExempt: false, pe } }).reqs.PE).toBe(status);
  });
});

describe("(g) Pass/Fail", () => {
  const pf = (code: string, termCode: string, extra: Partial<PlanItem> = {}) =>
    item({ courseCode: code, termCode, passFail: true, ...extra });

  it("warns above three elected P/F courses", () => {
    const three = [pf("ECO 101", "202401"), pf("PSY 101", "202402"), pf("SOC 101", "202501")];
    expect(codesOf(evaluate(three))).not.toContain("pass-fail-total");
    const four = [...three, pf("ECO 999", "202502", { status: "planned" })];
    expect(evaluate(four).warnings).toContainEqual({
      code: "pass-fail-total",
      message: "4 courses are Pass/Fail; at most 3 may be elected Pass/Fail.",
    });
  });

  it("warns at more than one in a semester, per semester", () => {
    const report = evaluate([pf("ECO 101", "202501"), pf("PSY 101", "202501")]);
    expect(report.warnings).toContainEqual({
      code: "pass-fail-term",
      message: "2 Pass/Fail courses in Fall 2025; at most 1 per semester.",
      termCode: "202501",
    });
  });

  it("counts failed P/F courses, but not dropped ones or transfer credit", () => {
    const report = evaluate([
      pf("ECO 101", "202501", { status: "failed" }),
      pf("PSY 101", "202501"),
      pf("SOC 101", "202502", { status: "dropped" }),
      pf("POL 121", "202502", { source: "transfer" }),
    ]);
    expect(report.warnings.filter((w) => w.code === "pass-fail-term")).toHaveLength(1);
    expect(codesOf(report)).not.toContain("pass-fail-total");
  });
});

describe("data quality warnings", () => {
  it("'no requirement data' for catalog items without codes; 'unverified' for unknown codes", () => {
    const thesis = item({ courseCode: "ANT 498", reqCodes: null, termCode: "202601" });
    const unknown = item({
      courseCode: "FAKE 999",
      reqCodes: null,
      unverified: true,
      source: "manual",
    });
    const report = evaluate([thesis, unknown]);
    expect(report.warnings).toContainEqual({
      code: "no-requirement-data",
      message: "No requirement data for ANT 498 in Fall 2026.",
      itemId: thesis.id,
      termCode: "202601",
    });
    expect(report.warnings).toContainEqual({
      code: "unverified-course",
      message:
        "FAKE 999 is not in the Davidson course data: its title, credits and requirements are unverified.",
      itemId: unknown.id,
      termCode: "202401",
    });
    expect(
      report.warnings.filter((w) => w.code === "no-requirement-data").map((w) => w.itemId),
    ).toEqual([thesis.id]);
  });
});

describe("a senior with 32 credits and no JEC course", () => {
  it("has 32 credits done and JEC still open", () => {
    const tags: ReqCode[][] = [
      ["COMP"],
      ["LTRQ"],
      ["HTRQ"],
      ["SSRQ"],
      ["NSRQ"],
      ["MQRQ"],
      ["PRRQ"],
      ["VPRQ"],
      ["CULT"],
      ["FRLG"],
    ];
    const terms = ["202301", "202302", "202401", "202402", "202501", "202502", "202601", "202602"];
    // The FRLG course is a Davidson language at the 201 level (the language rule), the rest ECO courses.
    const items = Array.from({ length: 32 }, (_, i) =>
      item({
        courseCode: tags[i]?.[0] === "FRLG" ? "SPA 201" : `ECO ${String(101 + i)}`,
        termCode: terms[Math.floor(i / 4)]!,
        reqCodes: tags[i] ?? ["NONE"],
      }),
    );
    const report = evaluate(items, {
      firstTerm: "202301",
      manual: { languageExempt: false, pe: { lifetimeActivities: 2, teamSport: true } },
    });
    expect(report.creditsDone).toBe(32);
    expect(report.reqs.JEC).toBe("open");
    const others = REQUIREMENT_SLOTS.filter((slot) => slot !== "JEC");
    expect(others.map((slot) => report.reqs[slot])).toEqual(others.map(() => "done"));
    expect(report.filledBy.JEC).toBeUndefined();
  });
});
