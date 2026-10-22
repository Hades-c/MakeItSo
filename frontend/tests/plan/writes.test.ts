import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertLegacyPlan, insertStudent, legacyDocs, planDoc, withPlanDb } from "./helpers";
import { AddPlanItemBodySchema, type AddPlanItemBody } from "@/lib/api/plan";
import type { PlanItem, PlanWarning } from "@/lib/types/plan";
import Plan from "@/models/Plan";
import type * as Catalog from "@/server/catalog";
import { ApiError } from "@/server/http/errors";
import {
  addItem,
  getPlan,
  getProgress,
  listDrafts,
  removeDeadline,
  removeItem,
  removeSummerActivity,
  saveDraft,
  updateDraftStatus,
  updateItem,
  updateManual,
  updateSummerActivity,
} from "@/server/plan";

/**
 * How the plan is written (PLAN §5 "Plan items": "patch: positional $set on whitelisted fields only; never
 * read-modify-write"; "v2 written only on the first mutation"):
 *   - a patch writes exactly the fields it names, so concurrent patches of ONE item all survive;
 *   - a stored CRN that has left the schedule never blocks a status, P/F or note change (only a warning), and
 *     such patches do not need the catalog at all;
 *   - a legacy student's v2 document appears only with a real change (never for a 400, 404, 409 or no-op);
 *   - a draft's status is one-way (pending → accepted | dismissed).
 * The catalog is the real fixture catalog, with a switch to make getSection / getCourse fail like an outage.
 */

const outage = vi.hoisted(() => ({ section: false, course: false }));

vi.mock("@/server/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof Catalog>();
  const { ApiError: Err } = await import("@/server/http/errors");
  const down = () => new Err(503, "unavailable", "Course data is unavailable right now.");
  return {
    ...actual,
    getSection: async (...args: Parameters<typeof actual.getSection>) => {
      if (outage.section) throw down();
      return actual.getSection(...args);
    },
    getCourse: async (...args: Parameters<typeof actual.getCourse>) => {
      if (outage.course) throw down();
      return actual.getCourse(...args);
    },
  };
});

withPlanDb();

beforeEach(() => {
  outage.section = false;
  outage.course = false;
});

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

async function stored(userId: string, itemId: string): Promise<PlanItem> {
  const found = (await getPlan(userId)).items.find((item) => item.id === itemId);
  expect(found).toBeDefined();
  return found!;
}

const messages = (warnings: readonly PlanWarning[]) => warnings.map((w) => w.message);

/** Point a stored item's CRN at a section that no longer exists (cancelled or renumbered upstream). */
async function orphanCrn(userId: string, itemId: string, crn: string): Promise<void> {
  await Plan.collection.updateOne(
    { userId: new mongoose.Types.ObjectId(userId) },
    { $set: { "items.$[it].crn": crn } },
    { arrayFilters: [{ "it._id": new mongoose.Types.ObjectId(itemId) }] },
  );
}

describe("concurrent patches of one item", () => {
  it("keep every change: {passFail} + {note} + {crn}, {status} + {note}, {crn} + {passFail}", async () => {
    for (let round = 0; round < 6; round += 1) {
      const user = await insertStudent();
      const { item } = await add(user, { termCode: "202602", courseCode: "CSC 221" });
      const three = await Promise.allSettled([
        updateItem(user, item.id, { passFail: true }),
        updateItem(user, item.id, { note: "bring laptop" }),
        updateItem(user, item.id, { crn: "20135" }),
      ]);
      expect(three.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
      expect(await stored(user, item.id)).toMatchObject({
        passFail: true,
        note: "bring laptop",
        crn: "20135",
        title: "Data Structures",
      });

      const two = await Promise.allSettled([
        updateItem(user, item.id, { status: "registered" }),
        updateItem(user, item.id, { note: "front row" }),
        updateItem(user, item.id, { passFail: false }),
      ]);
      expect(two.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
      expect(await stored(user, item.id)).toMatchObject({
        status: "registered",
        note: "front row",
        passFail: false,
        crn: "20135",
      });

      const other = (await add(user, { termCode: "202602", courseCode: "MAT 150" })).item;
      const crnAndPf = await Promise.allSettled([
        updateItem(user, other.id, { crn: "20301" }),
        updateItem(user, other.id, { passFail: true }),
      ]);
      expect(crnAndPf.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(await stored(user, other.id)).toMatchObject({ crn: "20301", passFail: true });
    }
  });

  it("two CRN changes race to one consistent listing (facts match the CRN kept)", async () => {
    const user = await insertStudent();
    const { item } = await add(user, { termCode: "202602", courseCode: "WRI 101" });
    const results = await Promise.allSettled([
      updateItem(user, item.id, { crn: "20521" }),
      updateItem(user, item.id, { crn: "20519" }),
      updateItem(user, item.id, { note: "topics" }),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    const kept = await stored(user, item.id);
    expect(["20521", "20519"]).toContain(kept.crn);
    const titles: Record<string, string> = {
      "20521": "Religion in the Public Square",
    };
    if (kept.crn === "20521") expect(kept.title).toBe(titles["20521"]);
    else expect(kept.title).not.toBe(titles["20521"]);
    expect(kept.note).toBe("topics");
  });

  it("writes only the named fields (the stored document keeps everything else untouched)", async () => {
    const user = await insertStudent();
    const { item } = await add(user, { termCode: "202602", courseCode: "CSC 221", crn: "20135" });
    const spy = vi.spyOn(Plan, "findOneAndUpdate");
    await updateItem(user, item.id, { note: "n" });
    const update = spy.mock.calls.at(-1)?.[1] as Record<string, Record<string, unknown>>;
    expect(Object.keys(update.$set ?? {})).toEqual(["items.$[it].note"]);
    expect(update.$unset).toBeUndefined();
    await updateItem(user, item.id, { status: "registered", passFail: true });
    const second = spy.mock.calls.at(-1)?.[1] as Record<string, Record<string, unknown>>;
    expect(Object.keys(second.$set ?? {}).sort()).toEqual([
      "items.$[it].passFail",
      "items.$[it].status",
    ]);
    spy.mockRestore();
  });
});

describe("a stored CRN that has left the schedule", () => {
  it("never blocks a status, P/F or note change; it warns and keeps the stored facts", async () => {
    const user = await insertStudent();
    const { item } = await add(user, { termCode: "202602", courseCode: "CSC 221", crn: "20135" });
    await orphanCrn(user, item.id, "29999");
    const noted = await updateItem(user, item.id, { note: "section cancelled" });
    expect(noted.item).toMatchObject({ crn: "29999", title: "Data Structures", credits: 1 });
    expect(messages(noted.warnings)).toContain(
      "CRN 29999 is no longer in the Spring 2027 schedule: pick another section of CSC 221, or clear the CRN.",
    );
    expect((await updateItem(user, item.id, { passFail: true })).item.passFail).toBe(true);
    // Re-sending the stored CRN with the patch changes nothing about the listing either.
    expect((await updateItem(user, item.id, { crn: "29999", note: "still" })).item.note).toBe(
      "still",
    );
    const dropped = await updateItem(user, item.id, { status: "dropped" });
    expect(dropped.item).toMatchObject({ status: "dropped", crn: "29999" });
    expect(dropped.warnings).toEqual([]);
    // A new CRN is still checked, and clearing it re-reads the course.
    expect((await rejection(updateItem(user, item.id, { crn: "29998" }))).message).toBe(
      "CRN 29998 is not a Spring 2027 section.",
    );
    const cleared = await updateItem(user, item.id, { crn: null });
    expect(cleared.item.crn).toBeUndefined();
    expect(cleared.item.title).toBe("Data Structures");
  });

  it("status, P/F and note patches need no catalog: an outage costs warnings, not the change", async () => {
    const user = await insertStudent();
    const { item } = await add(user, { termCode: "202602", courseCode: "CSC 221", crn: "20135" });
    const plain = (await add(user, { termCode: "202602", courseCode: "MAT 150" })).item;
    outage.section = true;
    outage.course = true;
    const noted = await updateItem(user, item.id, { note: "catalog down", status: "registered" });
    expect(noted.item).toMatchObject({ note: "catalog down", status: "registered", crn: "20135" });
    expect((await updateItem(user, plain.id, { passFail: true })).item.passFail).toBe(true);
    // A change of listing needs the catalog: that one is a 503, and nothing is written.
    expect((await rejection(updateItem(user, item.id, { crn: "20136" }))).status).toBe(503);
    expect((await stored(user, item.id)).crn).toBe("20135");
  });
});

describe("the same course twice counts once", () => {
  it("warns at add time when the course is already planned in another term, and counts it once", async () => {
    const user = await insertStudent();
    await add(user, { termCode: "202602", courseCode: "CSC 221" });
    const again = await add(user, { termCode: "202701", courseCode: "CSC 221" });
    expect(again.warnings).toContainEqual(
      expect.objectContaining({
        code: "already-completed",
        message:
          "CSC 221 is also in your Spring 2027 plan — a course counts once toward the degree unless it may be repeated for credit.",
      }),
    );
    const progress = await getProgress(user);
    expect(progress.creditsPlanned).toBe(1);
    expect(progress.warnings).toContainEqual(
      expect.objectContaining({ code: "already-completed", itemId: again.item.id }),
    );
  });
});

describe("class-year restrictions marked '+' (until the first day of class)", () => {
  it("are lifted once the term's classes have begun, and flagged before", async () => {
    // Class of 2027: a senior in 2026-2027. Fall 2026 classes began 2026-08-24; today is 2026-09-30.
    const user = await insertStudent({ graduationYear: 2027 });
    const fall = await add(user, {
      termCode: "202601",
      courseCode: "ART 101",
      crn: "10028", // ART 101 A, "12+": first-years and sophomores until the first day of class
      status: "registered",
    });
    expect(fall.warnings.map((w) => w.code)).not.toContain("restricted-standing");
    const spring = await add(user, { termCode: "202602", courseCode: "ART 101", crn: "20025" });
    expect(messages(spring.warnings)).toContain(
      "ART 101 A is limited to first-years and sophomores until the first day of class; you are a senior.",
    );
  });
});

describe("a legacy student's v2 document is written only by a real change", () => {
  async function legacyStudent() {
    const user = await insertStudent();
    const course = new mongoose.Types.ObjectId();
    await insertLegacyPlan(user, {
      plannedCourses: [
        {
          _id: course,
          courseId: new mongoose.Types.ObjectId(),
          courseCode: "CSC 121",
          semester: "Fall",
          year: 2025,
          credits: 4,
          status: "completed",
        },
      ],
      summerActivities: [{ title: "Hurt Hub internship", summer: "Summer 2027", year: 2027 }],
    });
    return { user, itemId: course.toHexString() };
  }

  it("never for a 400, 404, 409 or a change that changes nothing", async () => {
    const { user, itemId } = await legacyStudent();
    const before = await legacyDocs();
    expect((await rejection(updateItem(user, itemId, { crn: "99999" }))).status).toBe(400);
    expect((await rejection(updateItem(user, itemId, { termCode: "209901" }))).status).toBe(400);
    const unknown = new mongoose.Types.ObjectId().toHexString();
    expect((await rejection(updateItem(user, unknown, { status: "planned" }))).status).toBe(404);
    expect(
      (
        await rejection(
          add(user, { termCode: "202501", courseCode: "CSC 121", status: "completed" }),
        )
      ).status,
    ).toBe(409);
    // No-ops: the item as it is, the manual inputs as they are, an empty summer patch.
    expect((await updateItem(user, itemId, { status: "completed" })).item.id).toBe(itemId);
    expect(await updateManual(user, {})).toEqual({
      languageExempt: false,
      pe: { lifetimeActivities: 0, teamSport: false },
    });
    const summer = (await getPlan(user)).summer[0]!;
    expect(await updateSummerActivity(user, summer.id, {})).toEqual(summer);
    expect((await rejection(updateSummerActivity(user, unknown, { title: "x" }))).status).toBe(404);
    await removeItem(user, unknown);
    await removeSummerActivity(user, unknown);
    await removeDeadline(user, unknown);
    expect(await planDoc(user)).toBeNull();
    expect((await getPlan(user)).legacy).toBe(true);
    expect(await legacyDocs()).toEqual(before);

    // The first real change writes v2 (from the legacy plan) with that change.
    const noted = await updateItem(user, itemId, { note: "first change" });
    expect(noted.item.note).toBe("first change");
    const doc = await planDoc(user);
    expect(doc).toMatchObject({ importedFromLegacy: { via: "first-mutation" } });
    expect((await getPlan(user)).items).toEqual([noted.item]);
    expect(await legacyDocs()).toEqual(before);
  });
});

describe("drafts are one-way (pending → accepted | dismissed)", () => {
  const draftOf = (courses: string[]) => ({
    kind: "plan-suggestions" as const,
    promptVersion: "plan-suggestions@1",
    items: courses.map((courseCode) => ({ termCode: "202602", courseCode, reason: "Fits." })),
  });

  it("a dismissed draft cannot be accepted, and a replayed Accept never re-adds removed courses", async () => {
    const user = await insertStudent();
    const dismissed = await saveDraft(user, draftOf(["CSC 221", "MAT 150"]));
    await updateDraftStatus(user, dismissed.id, "dismissed");
    expect(await rejection(updateDraftStatus(user, dismissed.id, "accepted"))).toMatchObject({
      status: 409,
      message: "This draft was already dismissed.",
    });
    expect((await getPlan(user)).items).toEqual([]);

    const draft = await saveDraft(user, draftOf(["CSC 221", "MAT 150"]));
    const { added } = await updateDraftStatus(user, draft.id, "accepted");
    expect(added.map((item) => item.courseCode)).toEqual(["CSC 221", "MAT 150"]);
    await removeItem(user, added[0]!.id);
    expect((await rejection(updateDraftStatus(user, draft.id, "accepted"))).status).toBe(409);
    expect((await rejection(updateDraftStatus(user, draft.id, "dismissed"))).status).toBe(409);
    expect((await getPlan(user)).items.map((item) => item.courseCode)).toEqual(["MAT 150"]);
  });

  it("parallel Accepts add the courses once", async () => {
    const user = await insertStudent();
    const draft = await saveDraft(user, draftOf(["CSC 221", "MAT 150", "ECO 101"]));
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => updateDraftStatus(user, draft.id, "accepted")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(4);
    expect((await getPlan(user)).items).toHaveLength(3);
  });

  it("goes back to pending when the adds fail for another reason (a catalog outage)", async () => {
    const user = await insertStudent();
    const draft = await saveDraft(user, draftOf(["CSC 221"]));
    outage.course = true;
    expect((await rejection(updateDraftStatus(user, draft.id, "accepted"))).status).toBe(503);
    expect((await listDrafts(user))[0]?.status).toBe("pending");
    outage.course = false;
    const { added } = await updateDraftStatus(user, draft.id, "accepted");
    expect(added.map((item) => item.courseCode)).toEqual(["CSC 221"]);
  });
});
