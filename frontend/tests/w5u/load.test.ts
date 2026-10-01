import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { insertLegacyPlan, insertStudent, setNow, withPlanDb } from "../plan/helpers";
import User from "@/models/User";
import { addItem, addSummerActivity, saveDraft, saveWebTreeList } from "@/server/plan";
import {
  loadFourYear,
  loadNextSemester,
  loadSuggestions,
  loadSummer,
  slotLabels,
} from "@/app/(hub)/plan/_lib/load";

/**
 * The /plan loaders against the plan service, the fixture catalog (Spring 2027 = registration on 2026-09-30) and
 * an in-memory database.
 */

withPlanDb();

const add = (userId: string, body: Record<string, unknown>) =>
  addItem(userId, { status: "planned", passFail: false, source: "catalog", ...body } as never);

describe("loadNextSemester", () => {
  it("reports the registration term's list with sections, deadlines, plan courses and slot facts", async () => {
    const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
    await add(user, { termCode: "202501", courseCode: "WRI 101", status: "completed" });
    await add(user, { termCode: "202602", courseCode: "CSC 221", crn: "20135" });
    await saveWebTreeList(user, {
      termCode: "202602",
      choices: [
        { rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] },
        { rank: 2, crn: "20478", courseCode: "SPA 201", alternates: [] },
      ],
    });
    const loaded = await loadNextSemester(user, null);
    if (!loaded.ok) throw new Error(loaded.message);
    const data = loaded.data;
    expect(data.termCode).toBe("202602");
    expect(data.termLabel).toBe("Spring 2027");
    expect(Object.keys(data.sections).sort()).toEqual(["20135", "20136", "20478"]);
    expect(data.sections["20478"]).toMatchObject({
      courseCode: "SPA 201",
      section: "B",
      instructors: ["Rosalba Esparragoza"],
    });
    expect(data.report.conflicts.map((c) => c.day)).toEqual(["M", "W", "F"]);
    expect(data.report.copyText).toContain("1. CRN 20135  CSC 221 A  Data Structures");
    expect(data.deadlines.map((d) => d.id)).toEqual([
      "calendar:f26-webtree-spring27",
      "calendar:f26-webtree-closes",
      "calendar:f26-schedules-available",
      "calendar:f26-adddrop-november",
      "calendar:f26-adddrop-ends",
    ]);
    expect(data.deadlines.every((d) => d.source === "registrar")).toBe(true);
    expect(data.planCourses).toEqual([
      { courseCode: "CSC 221", title: "Data Structures", crn: "20135" },
    ]);
    expect(data.slotFillers.COMP).toEqual({ courseCode: "WRI 101", termCode: "202501" });
    expect(data.slotFillers.MQRQ).toEqual({ courseCode: "CSC 221", termCode: "202602" });
    // The props cross to client islands: plain data only.
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it("keeps a later term in the plan, falls back to registration for past and summer terms", async () => {
    const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
    expect(
      (await loadNextSemester(user, "202701")) as { data: { termCode: string } },
    ).toMatchObject({
      ok: true,
      data: { termCode: "202701", deadlines: [{ id: "calendar:s27-webtree-fall27" }] },
    });
    for (const term of ["202501", "202603"]) {
      const loaded = await loadNextSemester(user, term);
      expect(loaded.ok && loaded.data.termCode).toBe("202602");
    }
  });

  it("a client problem becomes a message; an unknown account is a 404 message", async () => {
    const loaded = await loadNextSemester("not-an-id", null);
    expect(loaded).toEqual({ ok: false, message: "Account not found." });
  });

  it("an unexpected failure is logged and worded, never thrown", async () => {
    const user = await insertStudent();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const find = vi.spyOn(User.collection, "findOne").mockRejectedValueOnce(new Error("db down"));
    const loaded = await loadFourYear(user);
    expect(loaded).toEqual({
      ok: false,
      message: "Your plan could not be loaded right now. Please try again in a minute.",
    });
    expect(spy).toHaveBeenCalled();
    find.mockRestore();
  });
});

describe("loadFourYear", () => {
  it("loads the plan, progress, the plan's terms and official slot names", async () => {
    const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
    await add(user, { termCode: "202501", courseCode: "WRI 101", status: "completed" });
    const loaded = await loadFourYear(user);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.data.current).toBe("202601");
    expect(loaded.data.registration).toBe("202602");
    expect(loaded.data.planTerms[0]).toBe("202501");
    expect(loaded.data.planTerms.at(-1)).toBe("202903");
    expect(loaded.data.progress).toMatchObject({ creditsDone: 1, reqs: { COMP: "done" } });
    expect(loaded.data.plan.legacy).toBe(false);
    expect(loaded.data.disclaimer).toBe("Unofficial — verify in Degree Works");
  });

  it("shows a legacy plan converted in memory, with uncatalogued courses unverified", async () => {
    const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
    await insertLegacyPlan(user, {
      plannedCourses: [
        {
          courseCode: "CSC 121",
          courseName: "x",
          credits: 4,
          semester: "Fall",
          year: 2025,
          status: "completed",
        },
        {
          courseCode: "FAKE 999",
          courseName: "Invented",
          credits: 4,
          semester: "Spring",
          year: 2027,
          status: "planned",
        },
      ],
    });
    const loaded = await loadFourYear(user);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.data.plan.legacy).toBe(true);
    const fake = loaded.data.plan.items.find((i) => i.courseCode === "FAKE 999");
    expect(fake).toMatchObject({ unverified: true, credits: 1 });
    expect(loaded.data.plan.items.find((i) => i.courseCode === "CSC 121")).toMatchObject({
      unverified: false,
      credits: 1,
    });
  });

  it("names every slot with its official name", () => {
    const labels = slotLabels();
    expect(labels.MQRQ).toBe("Mathematical and Quantitative Thought");
    expect(labels.COMP).toBe("Writing (Composition)");
    expect(labels.PE).toBe("Physical Education");
    expect(Object.keys(labels)).toHaveLength(12);
  });
});

describe("loadSuggestions", () => {
  it("explains the AI gate and shows no AI output while it is closed", async () => {
    const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
    await saveDraft(user, {
      kind: "plan-suggestions",
      promptVersion: "t",
      items: [{ termCode: "202602", courseCode: "CSC 221", reason: "r" }],
    });
    vi.stubEnv("AI_PROVIDER", "mock");
    const loaded = await loadSuggestions(user);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.data.gate?.kind).toBe("unverified");
    expect(loaded.data.drafts).toEqual([]);
    vi.stubEnv("AI_ENABLED", "false");
    const off = await loadSuggestions(user);
    expect(off.ok && off.data.gate?.kind).toBe("disabled");
  });

  it("lists plan-suggestion drafts for a verified, consenting student", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(user) },
      {
        $set: {
          emailVerifiedAt: new Date("2026-09-01"),
          aiConsentAt: new Date("2026-09-01"),
          adultAttestedAt: new Date("2026-09-01"),
        },
      },
    );
    await saveDraft(user, {
      kind: "plan-suggestions",
      promptVersion: "t",
      items: [{ termCode: "202602", courseCode: "CSC 221", reason: "r" }],
    });
    await saveDraft(user, {
      kind: "career-plan",
      promptVersion: "t",
      items: [{ termCode: "202602", courseCode: "ECO 101", reason: "r" }],
    });
    const loaded = await loadSuggestions(user);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.data.gate).toBeNull();
    expect(loaded.data.drafts.map((d) => d.kind)).toEqual(["plan-suggestions"]);
    expect(loaded.data.targetTerms[0]).toBe("202602");
    expect(loaded.data.targetTerms.every((t) => !t.endsWith("03"))).toBe(true);
  });
});

describe("loadSummer", () => {
  it("lists summer plans in term order, the plan's summers and the next summer as default", async () => {
    const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
    await addSummerActivity(user, { termCode: "202703", title: "B", kind: "job" });
    await addSummerActivity(user, { termCode: "202603", title: "A", kind: "research" });
    const loaded = await loadSummer(user);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.data.activities.map((a) => a.title)).toEqual(["A", "B"]);
    expect(loaded.data.summerTerms[0]).toBe("202503");
    expect(loaded.data.defaultTerm).toBe("202603");
    setNow("2027-09-15T12:00:00-04:00");
    const later = await loadSummer(user);
    expect(later.ok && later.data.defaultTerm).toBe("202703");
  });
});
