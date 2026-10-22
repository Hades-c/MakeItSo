import { describe, expect, it } from "vitest";
import {
  PlanItemSchema,
  PlanProgressSchema,
  REQUIREMENT_SLOTS,
  SummerActivitySchema,
  WebTreeListSchema,
  type PlanItem,
} from "@/lib/types/plan";

const item: PlanItem = {
  id: "0123456789abcdef01234567",
  termCode: "202602",
  courseCode: "CSC 221",
  canonicalCode: "CSC 221",
  title: "Data Structures",
  credits: 1,
  crn: "20411",
  status: "planned",
  passFail: false,
  source: "catalog",
  reqCodes: null,
  unverified: false,
};

describe("plan types (PLAN §4.1.4)", () => {
  it("accepts a plan item and rejects grades or unknown statuses", () => {
    expect(PlanItemSchema.parse(item)).toEqual(item);
    expect(PlanItemSchema.parse({ ...item, termCode: null, source: "ap" }).termCode).toBeNull();
    expect(PlanItemSchema.safeParse({ ...item, status: "passed" }).success).toBe(false);
    expect(PlanItemSchema.safeParse({ ...item, reqCodes: [] }).success).toBe(false);
    expect(PlanItemSchema.safeParse({ ...item, credits: 5 }).success).toBe(false);
  });

  it("requires every requirement slot in progress", () => {
    const reqs = Object.fromEntries(REQUIREMENT_SLOTS.map((slot) => [slot, "open"]));
    const progress = {
      creditsDone: 8,
      creditsPlanned: 12,
      required: 32,
      reqs,
      filledBy: { COMP: [item.id] },
      warnings: [{ code: "pass-fail-term", message: "More than one P/F course in Spring 2027" }],
    };
    expect(PlanProgressSchema.parse(progress).required).toBe(32);
    const { PE: _pe, ...missing } = reqs;
    expect(PlanProgressSchema.safeParse({ ...progress, reqs: missing }).success).toBe(false);
    expect(PlanProgressSchema.safeParse({ ...progress, required: 128 }).success).toBe(false);
  });

  it("keeps summer activities in summer terms", () => {
    const activity = {
      id: item.id,
      termCode: "202503",
      title: "Research assistant",
      kind: "research",
    };
    expect(SummerActivitySchema.parse(activity).termCode).toBe("202503");
    expect(SummerActivitySchema.safeParse({ ...activity, termCode: "202601" }).success).toBe(false);
  });

  it("ranks WebTree choices with alternates", () => {
    const list = WebTreeListSchema.parse({
      termCode: "202602",
      choices: [{ rank: 1, crn: 20411, courseCode: "csc221", alternates: ["20412"] }],
    });
    expect(list.choices[0]).toEqual({
      rank: 1,
      crn: "20411",
      courseCode: "CSC 221",
      alternates: ["20412"],
    });
  });
});
