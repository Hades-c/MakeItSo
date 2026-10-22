import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanItem, PlanView } from "@/lib/types/plan";
import { ApiError, notImplemented } from "@/server/http/errors";
import { MissingFixtureError } from "@/server/http/fixtures";

const plan = vi.hoisted(() => ({ getPlan: vi.fn() }));
vi.mock("@/server/plan", () => ({ getPlan: plan.getPlan }));

const { loadPlanPresence, planPresence } = await import("@/app/(hub)/careers/_lib/plan");

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
    expect([...(presence.get("CSC 221") ?? [])].sort()).toEqual(["202601", "202602"]);
    expect([...(presence.get("PSY 303") ?? [])]).toEqual(["202701"]);
    expect([...(presence.get("BIO 331") ?? [])]).toEqual(["202701"]);
    expect([...(presence.get("ECO 101") ?? [])]).toEqual(["202501"]);
  });

  it("ignores dropped, failed and withdrawn items and items without a term", () => {
    const presence = planPresence([
      item({ status: "dropped" }),
      item({ status: "failed", termCode: "202601" }),
      item({ status: "withdrawn", termCode: "202501" }),
      item({ termCode: null, source: "ap" }),
    ]);
    expect(presence.size).toBe(0);
  });
});

describe("loadPlanPresence", () => {
  it("reads the student's plan", async () => {
    plan.getPlan.mockResolvedValue(view([item({})]));
    const presence = await loadPlanPresence(USER);
    expect(plan.getPlan).toHaveBeenCalledWith(USER);
    expect([...(presence?.get("CSC 221") ?? [])]).toEqual(["202602"]);
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
