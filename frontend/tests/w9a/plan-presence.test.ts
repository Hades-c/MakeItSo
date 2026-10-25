import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanItem, PlanView } from "@/lib/types/plan";
import { ApiError, notImplemented } from "@/server/http/errors";
import { MissingFixtureError } from "@/server/http/fixtures";
import { fixtureClock } from "../helpers/terms";

const plan = vi.hoisted(() => ({ getPlan: vi.fn() }));
vi.mock("@/server/plan", () => ({ getPlan: plan.getPlan }));

const { courseStanding, loadPlanPresence, planPresence, plannedTerms, standingText } =
  await import("@/app/(hub)/careers/_lib/plan");

const USER = "0123456789abcdef01234567";

function item(fields: Partial<PlanItem>): PlanItem {
  return {
    id: "0123456789abcdef0123456a",
    termCode: "202602",
    courseCode: "CSC 221",
    canonicalCode: "CSC 221",
    title: "Data Structures",
    credits: 1,
    status: "planned",
    passFail: false,
    source: "catalog",
    reqCodes: null,
    unverified: false,
    ...fields,
  };
}

function view(items: PlanItem[]): PlanView {
  return {
    items,
    summer: [],
    deadlines: [],
    manual: { languageExempt: false, pe: { lifetimeActivities: 0, teamSport: false } },
    legacy: false,
    updatedAt: null,
  };
}

beforeEach(() => {
  plan.getPlan.mockReset();
});

describe("planPresence", () => {
  it("lists the terms of active items per code (listing and canonical code)", () => {
    const presence = planPresence([
      item({}),
      item({ termCode: "202601", status: "in-progress" }),
      item({ courseCode: "PSY 303", canonicalCode: "BIO 331", termCode: "202701" }),
      item({
        courseCode: "ECO 101",
        canonicalCode: "ECO 101",
        status: "completed",
        termCode: "202501",
      }),
    ]);
    expect(Object.fromEntries(presence.get("CSC 221") ?? [])).toEqual({
      "202601": "in-progress",
      "202602": "planned",
    });
    expect(Object.fromEntries(presence.get("PSY 303") ?? [])).toEqual({ "202701": "planned" });
    expect(Object.fromEntries(presence.get("BIO 331") ?? [])).toEqual({ "202701": "planned" });
    expect(Object.fromEntries(presence.get("ECO 101") ?? [])).toEqual({ "202501": "completed" });
  });

  it("ignores dropped items and items without a term", () => {
    const presence = planPresence([
      item({ status: "dropped" }),
      item({ termCode: null, source: "ap" }),
    ]);
    expect(presence.size).toBe(0);
  });

  it("keeps failed and withdrawn items, behind an active item in the same term, never as planned terms", () => {
    const presence = planPresence([
      item({ status: "failed", termCode: "202601" }),
      item({ status: "withdrawn", termCode: "202501" }),
      item({ id: "0123456789abcdef0123456b", status: "failed", termCode: "202602" }),
      item({ id: "0123456789abcdef0123456c", status: "planned", termCode: "202602" }),
    ]);
    const entries = presence.get("CSC 221");
    expect(Object.fromEntries(entries ?? [])).toEqual({
      "202501": "withdrawn",
      "202601": "failed",
      "202602": "planned",
    });
    // Add to plan's "In your plan for …" counts active items only.
    expect(plannedTerms(entries)).toEqual(["202602"]);
  });
});

describe("courseStanding", () => {
  // Judged on the fixture terms; by default on the fixtures' day (Sep 30, 2026: Fall 2026 in session).
  const standing = (items: PlanItem[], at?: string) =>
    courseStanding(planPresence(items).get("CSC 221"), fixtureClock(at));
  const text = (items: PlanItem[], at?: string) => {
    const s = standing(items, at);
    return s ? standingText(s) : null;
  };

  it("is null for a course not taken yet, planned or not", () => {
    expect(standing([])).toBeNull();
    expect(standing([item({ status: "planned", termCode: "202602" })])).toBeNull();
    // Registered for a later term: in the plan, not taken.
    expect(standing([item({ status: "registered", termCode: "202602" })])).toBeNull();
    // Dropped, failed and withdrawn items in past terms are history: the course can be added again.
    expect(standing([item({ status: "failed", termCode: "202501" })])).toBeNull();
    expect(standing([item({ status: "withdrawn", termCode: "202502" })])).toBeNull();
    expect(standing([item({ status: "dropped", termCode: "202601" })])).toBeNull();
  });

  it("never says Completed for the current term: marked Completed, check your plan", () => {
    // The fixtures clock (Sep 30, 2026): Fall 2026 is the current term and is not over.
    const marked = text([item({ status: "completed", termCode: "202601" })]);
    expect(marked).toEqual({
      text: "In your Fall 2026 plan · marked Completed, check your plan",
      warning: true,
      check: { words: "check your plan", href: "/plan?tab=four-year" },
    });
    expect(marked?.text).not.toMatch(/^Completed/);
    expect(standing([item({ status: "completed", termCode: "202601" })])).toEqual({
      kind: "marked",
      term: "202601",
      status: "completed",
    });
    // The same in Spring 2027 once it is the current term, and for a later term.
    expect(
      text([item({ status: "completed", termCode: "202602" })], "2027-02-01T12:00:00-05:00")?.text,
    ).toBe("In your Spring 2027 plan · marked Completed, check your plan");
    expect(text([item({ status: "completed", termCode: "202701" })])?.text).toBe(
      "In your Fall 2027 plan · marked Completed, check your plan",
    );
  });

  it("flags failed for a term that is not over and withdrawn for one that has not begun, in the status's own word", () => {
    expect(text([item({ status: "failed", termCode: "202601" })])?.text).toBe(
      "In your Fall 2026 plan · marked Failed, check your plan",
    );
    expect(text([item({ status: "withdrawn", termCode: "202602" })])?.text).toBe(
      "In your Spring 2027 plan · marked Withdrawn, check your plan",
    );
  });

  it("takes a withdrawal from the term in session as history: no flag, and the course can be added again", () => {
    const at = "2026-10-25T12:00:00-04:00";
    expect(standing([item({ status: "withdrawn", termCode: "202601" })], at)).toBeNull();
    // An earlier completion still says so.
    expect(
      text(
        [
          item({ status: "completed", termCode: "202501" }),
          item({ id: "0123456789abcdef0123456b", status: "withdrawn", termCode: "202601" }),
        ],
        at,
      ),
    ).toEqual({ text: "Completed Fall 2025", warning: false });
  });

  it("goes by the term's end date, not the current term: a finished term's result is real", () => {
    // Dec 20: Fall 2026 is over (Dec 15) but stays the current term until Spring 2027 starts (Jan 19).
    expect(
      text([item({ status: "completed", termCode: "202601" })], "2026-12-20T12:00:00-05:00"),
    ).toEqual({ text: "Completed Fall 2026", warning: false });
    // Jun 15: Spring 2027 is over (May 12) and stays current until Fall 2027.
    expect(
      text([item({ status: "completed", termCode: "202602" })], "2027-06-15T12:00:00-04:00"),
    ).toEqual({ text: "Completed Spring 2027", warning: false });
    // Summer 2026 by its own dates (May 19 to Aug 14), though Spring 2026 is current all summer.
    expect(
      text([item({ status: "completed", termCode: "202503" })], "2026-07-01T12:00:00-04:00")?.text,
    ).toBe("In your Summer 2026 plan · marked Completed, check your plan");
    expect(
      text([item({ status: "completed", termCode: "202503" })], "2026-08-20T12:00:00-04:00"),
    ).toEqual({ text: "Completed Summer 2026", warning: false });
  });

  it("says Taking now only for the current term while it runs; other in-progress rows need a check", () => {
    const at = "2026-10-25T12:00:00-04:00";
    expect(text([item({ status: "in-progress", termCode: "202601" })], at)).toEqual({
      text: "Taking now (Fall 2026)",
      warning: false,
    });
    for (const [termCode, label] of [
      ["202501", "Fall 2025"],
      ["202602", "Spring 2027"],
    ] as const) {
      expect(text([item({ status: "in-progress", termCode })], at)).toEqual({
        text: `In your ${label} plan · marked In progress, check your plan`,
        warning: true,
        check: { words: "check your plan", href: "/plan?tab=four-year" },
      });
    }
    // Fall 2026 has ended, though it is still the current term: in progress needs a check, and so does a
    // registration (which then is no longer "taking now" either).
    const dec20 = "2026-12-20T12:00:00-05:00";
    expect(text([item({ status: "in-progress", termCode: "202601" })], dec20)?.text).toBe(
      "In your Fall 2026 plan · marked In progress, check your plan",
    );
    expect(standing([item({ status: "registered", termCode: "202601" })], dec20)).toBeNull();
  });

  it("judges the latest result: a real completion before a result marked too early still needs a check", () => {
    const items = [
      item({ status: "completed", termCode: "202501" }),
      item({ id: "0123456789abcdef0123456b", status: "completed", termCode: "202601" }),
    ];
    expect(text(items)?.text).toBe("In your Fall 2026 plan · marked Completed, check your plan");
    // A term that is over is a real result: Completed Fall 2025, then Taking now.
    expect(
      text([
        item({ status: "completed", termCode: "202501" }),
        item({ id: "0123456789abcdef0123456b", status: "failed", termCode: "202502" }),
      ])?.text,
    ).toBe("Completed Fall 2025");
  });

  it("judges by the date's term without a terms list", () => {
    const clock = { terms: [], at: new Date("2026-10-25T12:00:00-04:00") };
    const presence = (status: PlanItem["status"], termCode: string) =>
      planPresence([item({ status, termCode })]).get("CSC 221");
    expect(courseStanding(presence("completed", "202601"), clock)).toEqual({
      kind: "marked",
      term: "202601",
      status: "completed",
    });
    expect(courseStanding(presence("completed", "202502"), clock)).toEqual({
      kind: "completed",
      term: "202502",
      then: null,
    });
    expect(courseStanding(presence("in-progress", "202601"), clock)).toEqual({
      kind: "taking-now",
      term: "202601",
      then: null,
    });
  });

  it("says completed (the latest term) and taking now in words", () => {
    expect(text([item({ status: "completed", termCode: "202501" })])).toEqual({
      text: "Completed Fall 2025",
      warning: false,
    });
    expect(
      text([
        item({ status: "completed", termCode: "202401" }),
        item({ id: "0123456789abcdef0123456b", status: "completed", termCode: "202502" }),
      ]),
    ).toEqual({ text: "Completed Spring 2026", warning: false });
    expect(text([item({ status: "in-progress", termCode: "202601" })])).toEqual({
      text: "Taking now (Fall 2026)",
      warning: false,
    });
    // Registered for the current term counts as taking it now.
    expect(text([item({ status: "registered", termCode: "202601" })])).toEqual({
      text: "Taking now (Fall 2026)",
      warning: false,
    });
  });

  it("warns about a repeat: completed or under way, and in the plan again", () => {
    expect(
      text([
        item({ status: "completed", termCode: "202502" }),
        item({ id: "0123456789abcdef0123456b", status: "planned", termCode: "202602" }),
      ]),
    ).toEqual({ text: "Completed Spring 2026 · in your Spring 2027 plan", warning: true });
    expect(
      text([
        item({ status: "completed", termCode: "202502" }),
        item({ id: "0123456789abcdef0123456b", status: "in-progress", termCode: "202601" }),
      ]),
    ).toEqual({ text: "Completed Spring 2026 · taking now (Fall 2026)", warning: true });
    expect(
      text([
        item({ status: "in-progress", termCode: "202601" }),
        item({ id: "0123456789abcdef0123456b", status: "planned", termCode: "202602" }),
      ]),
    ).toEqual({ text: "Taking now (Fall 2026) · in your Spring 2027 plan", warning: true });
  });
});

describe("loadPlanPresence", () => {
  it("reads the student's plan", async () => {
    plan.getPlan.mockResolvedValue(view([item({})]));
    const presence = await loadPlanPresence(USER);
    expect(plan.getPlan).toHaveBeenCalledWith(USER);
    expect([...(presence?.get("CSC 221")?.keys() ?? [])]).toEqual(["202602"]);
  });

  it("is unknown (null), quietly, while the plan service is not implemented (501)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    plan.getPlan.mockRejectedValue(notImplemented("getPlan"));
    await expect(loadPlanPresence(USER)).resolves.toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("is unknown (null) and logged when the plan cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    plan.getPlan.mockRejectedValue(new ApiError(503, "unavailable", "Database down"));
    await expect(loadPlanPresence(USER)).resolves.toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("never hides a missing fixture", async () => {
    plan.getPlan.mockRejectedValue(new MissingFixtureError("course-schedule", "GET", "https://x"));
    await expect(loadPlanPresence(USER)).rejects.toBeInstanceOf(MissingFixtureError);
  });
});
