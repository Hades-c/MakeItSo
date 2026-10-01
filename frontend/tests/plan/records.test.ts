import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { insertStudent, planDoc, withPlanDb } from "./helpers";
import { AddPlanItemBodySchema, type AddPlanItemBody } from "@/lib/api/plan";
import {
  PlanDraftSchema,
  PlanProgressSchema,
  StudentDeadlineSchema,
  SummerActivitySchema,
} from "@/lib/types/plan";
import {
  accountDataNames,
  eraseAccountData,
  exportAccountData,
  loadAccountDataRegistrations,
} from "@/server/account/erasers";
import { ApiError } from "@/server/http/errors";
import {
  addDeadline,
  addItem,
  addSummerActivity,
  getPlan,
  getPlanCredits,
  getProgress,
  listDeadlines,
  listDrafts,
  listSummerActivities,
  removeDeadline,
  removeSummerActivity,
  saveDraft,
  updateDraftStatus,
  updateManual,
  updateSummerActivity,
} from "@/server/plan";
import type { RequirementsReport } from "@/server/plan";

/** Summer activities, student deadlines, manual inputs, AI drafts, progress/credits and account data. */

withPlanDb();

const add = (userId: string, body: AddPlanItemBody) =>
  addItem(userId, AddPlanItemBodySchema.parse(body));

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("summer activities", () => {
  it("adds, lists by term, patches ('' clears) and removes", async () => {
    const user = await insertStudent();
    const later = await addSummerActivity(user, {
      termCode: "202703",
      title: "Research at Davidson",
      kind: "research",
      organization: "Chemistry",
      note: "with Dr. Smith",
    });
    const sooner = await addSummerActivity(user, {
      termCode: "202603",
      title: "Camp counselor",
      kind: "job",
    });
    expect(SummerActivitySchema.parse(later)).toEqual(later);
    expect((await listSummerActivities(user)).map((a) => a.id)).toEqual([sooner.id, later.id]);
    expect(await updateSummerActivity(user, later.id, {})).toEqual(later);
    const patched = await updateSummerActivity(user, later.id, {
      title: "REU",
      organization: "",
      note: "",
    });
    expect(patched).toEqual({ id: later.id, termCode: "202703", title: "REU", kind: "research" });
    await removeSummerActivity(user, sooner.id);
    await removeSummerActivity(user, sooner.id);
    expect((await getPlan(user)).summer).toEqual([patched]);
  });

  it("keeps summers inside the plan's range and 404s unknown entries", async () => {
    const user = await insertStudent();
    expect(
      await rejection(
        addSummerActivity(user, { termCode: "202903", title: "Too late", kind: "other" }),
      ),
    ).toMatchObject({
      status: 400,
      message: "Summer 2030 is outside your plan (Fall 2024 – Summer 2029).",
    });
    const unknown = new mongoose.Types.ObjectId().toHexString();
    expect((await rejection(updateSummerActivity(user, unknown, { title: "x" }))).status).toBe(404);
    await addSummerActivity(user, { termCode: "202603", title: "Camp", kind: "job" });
    expect(await rejection(updateSummerActivity(user, unknown, { title: "x" }))).toMatchObject({
      status: 404,
      message: "That summer entry is not in your plan.",
    });
    expect((await rejection(updateSummerActivity(user, "bad", { title: "x" }))).status).toBe(404);
  });
});

describe("student deadlines", () => {
  it("adds, lists by due date, and removes", async () => {
    const user = await insertStudent();
    const late = await addDeadline(user, {
      title: "Problem set 4",
      dueAt: "2026-10-09T23:59:00-04:00",
      courseCode: "csc221",
    });
    const soon = await addDeadline(user, {
      title: "Essay draft",
      dueAt: "2026-10-01T17:00:00-04:00",
    });
    expect(StudentDeadlineSchema.parse(late)).toEqual(late);
    expect(late).toMatchObject({ dueAt: "2026-10-10T03:59:00.000Z", courseCode: "CSC 221" });
    expect((await listDeadlines(user)).map((d) => d.title)).toEqual([
      "Essay draft",
      "Problem set 4",
    ]);
    await removeDeadline(user, soon.id);
    await removeDeadline(user, "nope");
    expect(await listDeadlines(user)).toEqual([late]);
    expect((await getPlan(user)).deadlines).toEqual([late]);
  });

  it("lists nothing (and writes nothing) for a student without a plan", async () => {
    const user = await insertStudent();
    expect(await listDeadlines(user)).toEqual([]);
    await removeDeadline(user, new mongoose.Types.ObjectId().toHexString());
    expect(await planDoc(user)).toBeNull();
  });
});

describe("manual requirement inputs", () => {
  it("sets the language exemption and PE checklist, which the progress reads", async () => {
    const user = await insertStudent();
    expect(await updateManual(user, { languageExempt: true })).toEqual({
      languageExempt: true,
      pe: { lifetimeActivities: 0, teamSport: false },
    });
    expect(await updateManual(user, { pe: { lifetimeActivities: 2, teamSport: true } })).toEqual({
      languageExempt: true,
      pe: { lifetimeActivities: 2, teamSport: true },
    });
    const progress = await getProgress(user);
    expect(progress.reqs).toMatchObject({ FRLG: "done", PE: "done" });
    expect((await getPlan(user)).manual.languageExempt).toBe(true);
  });
});

describe("progress and credits", () => {
  it("evaluates the stored plan with the first term's catalog year, unofficially", async () => {
    const user = await insertStudent({ graduationYear: 2030, firstTerm: "202601" });
    await add(user, {
      termCode: "202601",
      courseCode: "WRI 101",
      crn: "10521",
      status: "in-progress",
    });
    await add(user, {
      termCode: "202601",
      courseCode: "EDU 330",
      crn: "10617",
      status: "in-progress",
    });
    await add(user, { termCode: "202602", courseCode: "CSC 221" });
    const progress = (await getProgress(user)) as RequirementsReport;
    expect(PlanProgressSchema.parse(progress)).toMatchObject({
      creditsDone: 0,
      creditsPlanned: 3,
      required: 32,
    });
    expect(progress.reqs).toMatchObject({
      COMP: "this-term",
      JEC: "this-term",
      SSRQ: "this-term",
      MQRQ: "planned",
    });
    expect(progress).toMatchObject({
      disclaimer: "Unofficial — verify in Degree Works",
      catalogYear: "2026-2027",
      rulesExact: true,
    });
    expect(progress.warnings.map((w) => w.code)).not.toContain("writing-not-done-first-year");
    expect(await getPlanCredits(user)).toEqual({ done: 0, planned: 3, required: 32 });
  });

  it("answers zero credits for a student without a plan", async () => {
    const user = await insertStudent();
    expect(await getPlanCredits(user)).toEqual({ done: 0, planned: 0, required: 32 });
  });
});

describe("AI drafts", () => {
  const draftInput = (items: { termCode: string; courseCode: string }[]) => ({
    kind: "plan-suggestions" as const,
    promptVersion: "plan-suggestions@1",
    items: items.map((entry) => ({ ...entry, reason: "Builds toward the CS major." })),
  });

  it("stores drafts (newest first, at most 20)", async () => {
    const user = await insertStudent();
    const first = await saveDraft(
      user,
      draftInput([{ termCode: "202602", courseCode: "CSC 221" }]),
    );
    expect(PlanDraftSchema.parse(first)).toMatchObject({
      status: "pending",
      createdAt: "2026-09-30T16:00:00.000Z",
    });
    for (let i = 0; i < 21; i += 1)
      await saveDraft(user, draftInput([{ termCode: "202602", courseCode: "MAT 150" }]));
    const drafts = await listDrafts(user);
    expect(drafts).toHaveLength(20);
    expect(drafts.map((d) => d.id)).not.toContain(first.id);
    // W6 must hand over a valid draft: anything else is its bug (a ZodError → 500), not stored.
    await expect(saveDraft(user, { ...draftInput([]), kind: "other" } as never)).rejects.toThrow();
    expect(await listDrafts(user)).toHaveLength(20);
  });

  it("accepting adds each course not in the plan yet, per course — never hiding a whole term", async () => {
    const user = await insertStudent();
    await add(user, { termCode: "202601", courseCode: "CSC 121", status: "in-progress" });
    await add(user, { termCode: "202701", courseCode: "MAT 150" });
    const draft = await saveDraft(
      user,
      draftInput([
        { termCode: "202601", courseCode: "ECO 101" }, // same term as an in-progress course: still added
        { termCode: "202602", courseCode: "CSC 121" }, // already in the plan (another term): ticked off
        { termCode: "202602", courseCode: "MAT 150" }, // planned for Fall 2027: ticked off
        { termCode: "202602", courseCode: "CSC 221" },
        { termCode: "203101", courseCode: "HIS 124" }, // outside the plan's terms: left out
      ]),
    );
    const { draft: accepted, added } = await updateDraftStatus(user, draft.id, "accepted");
    expect(accepted.status).toBe("accepted");
    expect(added.map((i) => `${i.termCode} ${i.courseCode} ${i.source} ${i.status}`)).toEqual([
      "202601 ECO 101 ai-draft planned",
      "202602 CSC 221 ai-draft planned",
    ]);
    expect((await listDrafts(user))[0]?.status).toBe("accepted");
    expect((await getPlan(user)).items).toHaveLength(4);
    // One-way: accepting again (a double submit or a replay) is a 409 that adds nothing.
    expect(await rejection(updateDraftStatus(user, draft.id, "accepted"))).toMatchObject({
      status: 409,
      message: "This draft was already accepted.",
    });
    expect((await getPlan(user)).items).toHaveLength(4);
  });

  it("dismisses, and 404s unknown drafts", async () => {
    const user = await insertStudent();
    const draft = await saveDraft(
      user,
      draftInput([{ termCode: "202602", courseCode: "CSC 221" }]),
    );
    expect(await updateDraftStatus(user, draft.id, "dismissed")).toEqual({
      draft: { ...draft, status: "dismissed" },
      added: [],
    });
    expect((await getPlan(user)).items).toEqual([]);
    const error = await rejection(
      updateDraftStatus(user, new mongoose.Types.ObjectId().toHexString(), "accepted"),
    );
    expect(error).toMatchObject({ status: 404, message: "That draft is not in your plan." });
  });
});

describe("account data (export + erase)", () => {
  it("registers plans with the registry: exports and erases only the student's document", async () => {
    await loadAccountDataRegistrations();
    expect(accountDataNames()).toContain("plans");
    const user = await insertStudent();
    const other = await insertStudent();
    await add(user, { termCode: "202602", courseCode: "CSC 221" });
    await add(other, { termCode: "202602", courseCode: "CSC 221" });
    const exported = (await exportAccountData(user)).plans as { items: { courseCode: string }[] };
    expect(exported.items.map((i) => i.courseCode)).toEqual(["CSC 221"]);
    const removed = await eraseAccountData(user);
    expect(removed.plans).toBe(1);
    expect(await planDoc(user)).toBeNull();
    expect(await planDoc(other)).not.toBeNull();
    expect((await exportAccountData("not-an-id")).plans).toBeNull();
    expect((await eraseAccountData("not-an-id")).plans).toBe(0);
  });
});
