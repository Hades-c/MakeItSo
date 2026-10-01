import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";
import { insertStudent, planDoc, withPlanDb } from "./helpers";
import type { AddPlanItemBody } from "@/lib/api/plan";
import { AddPlanItemBodySchema } from "@/lib/api/plan";
import { PlanItemSchema, type PlanWarning } from "@/lib/types/plan";
import Plan from "@/models/Plan";
import { ApiError } from "@/server/http/errors";
import { addItem, getPlan, removeItem, updateItem } from "@/server/plan";

/**
 * Plan items (PLAN §5 "Plan items"): catalog-validated adds, the duplicate key, retakes, restriction flags as
 * warnings, whitelisted atomic patches, $pull removes, and concurrency. Default student: class of 2028, first
 * term Fall 2024 (a junior on 2026-09-30); plan range Fall 2024 – Summer 2029.
 */

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

const codes = (warnings: readonly PlanWarning[]) => warnings.map((w) => w.code);

describe("addItem: catalog facts from the listing registered under", () => {
  it("takes title, credits and requirement codes from the catalog for that term", async () => {
    const user = await insertStudent();
    const { item, warnings } = await add(user, { termCode: "202602", courseCode: "csc221" });
    expect(PlanItemSchema.parse(item)).toEqual(item);
    expect(item).toMatchObject({
      termCode: "202602",
      courseCode: "CSC 221",
      canonicalCode: "CSC 221",
      title: "Data Structures",
      credits: 1,
      status: "planned",
      passFail: false,
      source: "catalog",
      reqCodes: ["MQRQ"],
      unverified: false,
    });
    expect(item.crn).toBeUndefined();
    expect(warnings).toEqual([]);
    expect((await getPlan(user)).items).toEqual([item]);
  });

  it("keeps a topics course's chosen section title; without a CRN the neutral course title", async () => {
    const user = await insertStudent();
    const chosen = await add(user, { termCode: "202602", courseCode: "WRI 101", crn: "20520" });
    expect(chosen.item).toMatchObject({
      crn: "20520",
      title: "Writing about Literature",
      reqCodes: ["COMP"],
    });
    const other = await insertStudent();
    const neutral = await add(other, { termCode: "202602", courseCode: "WRI 101" });
    expect(neutral.item.title).toBe("Writing Program: topics vary by section");
    expect(neutral.item.reqCodes).toEqual(["COMP"]);
  });

  it("uses the codes of the listing registered under and counts cross-listed siblings once", async () => {
    const user = await insertStudent();
    // SOC 330 A is cross-listed with EDU 330 A: CULT + SSRQ under SOC, JEC + SSRQ under EDU.
    const soc = await add(user, { termCode: "202601", courseCode: "SOC 330", crn: "10758" });
    expect(soc.item).toMatchObject({
      courseCode: "SOC 330",
      canonicalCode: "EDU 330",
      reqCodes: ["CULT", "SSRQ"],
    });
    const error = await rejection(add(user, { termCode: "202601", courseCode: "EDU 330" }));
    expect(error).toMatchObject({
      status: 409,
      code: "conflict",
      message: "EDU 330 is already in your Fall 2026 plan as SOC 330.",
    });
    const other = await insertStudent();
    const edu = await add(other, { termCode: "202601", courseCode: "EDU 330" });
    expect(edu.item).toMatchObject({ canonicalCode: "EDU 330", reqCodes: ["JEC", "SSRQ"] });
  });

  it("stores the listing of the CRN given (ENV 214 A for a PHY 214 search)", async () => {
    const user = await insertStudent();
    const { item } = await add(user, { termCode: "202601", courseCode: "PHY 214", crn: "10227" });
    expect(item).toMatchObject({ courseCode: "ENV 214", canonicalCode: "ENV 214", crn: "10227" });
    const again = await rejection(add(user, { termCode: "202601", courseCode: "PHY 214" }));
    expect(again.status).toBe(409);
  });

  it("rejects a CRN that is not a section of the course in that term", async () => {
    const user = await insertStudent();
    expect(
      await rejection(add(user, { termCode: "202602", courseCode: "WRI 101", crn: "20135" })),
    ).toMatchObject({
      status: 400,
      code: "validation_failed",
      message: "CRN 20135 is CSC 221 A, not WRI 101.",
    });
    expect(
      await rejection(add(user, { termCode: "202602", courseCode: "CSC 221", crn: "99999" })),
    ).toMatchObject({ status: 400, message: "CRN 99999 is not a Spring 2027 section." });
    expect(
      await rejection(
        add(user, { termCode: null, courseCode: "CSC 221", crn: "20135", source: "ap" }),
      ),
    ).toMatchObject({ status: 400, message: "A CRN needs a term." });
    expect(await planDoc(user)).toBeNull();
  });

  it("uses the nearest offering for a term that does not list the course", async () => {
    const user = await insertStudent();
    const future = await add(user, { termCode: "202701", courseCode: "CSC 221" });
    expect(future.item).toMatchObject({ title: "Data Structures", unverified: false });
    expect(future.warnings).toEqual([]);
    // A published term without the course: kept, with a "check the term" warning.
    const offTerm = await add(user, { termCode: "202601", courseCode: "HUM 104" });
    expect(offTerm.item).toMatchObject({
      title: "Connections and Conflicts II",
      unverified: false,
    });
    expect(offTerm.warnings).toContainEqual({
      code: "unverified-course",
      message:
        "HUM 104 is not in the Fall 2026 schedule — check the term. Title and credits come from Spring 2027.",
      itemId: offTerm.item.id,
      termCode: "202601",
    });
  });

  it("accepts a code in no ingested term as a manual, unverified entry (credits 1, never 4)", async () => {
    const user = await insertStudent();
    const plain = await add(user, { termCode: "202602", courseCode: "FAKE 999" });
    expect(plain.item).toMatchObject({
      courseCode: "FAKE 999",
      canonicalCode: "FAKE 999",
      title: "FAKE 999",
      credits: 1,
      source: "manual",
      reqCodes: null,
      unverified: true,
    });
    expect(codes(plain.warnings)).toEqual(["unverified-course"]);
    const named = await add(user, {
      termCode: "202503",
      courseCode: "BIO 999",
      manualTitle: "Marine Biology (UNC Wilmington)",
      manualCredits: 2,
      source: "transfer",
    });
    expect(named.item).toMatchObject({
      title: "Marine Biology (UNC Wilmington)",
      credits: 2,
      source: "transfer",
      unverified: true,
    });
  });

  it("rejects an AI draft course the catalog does not know", async () => {
    const user = await insertStudent();
    expect(
      await rejection(
        add(user, { termCode: "202602", courseCode: "FAKE 999", source: "ai-draft" }),
      ),
    ).toMatchObject({ status: 400, message: "FAKE 999 is not in the Davidson course data." });
  });

  it("lists AP/transfer credit without a term; other entries need one", async () => {
    const user = await insertStudent();
    const ap = await add(user, {
      termCode: null,
      courseCode: "MAT 110",
      source: "ap",
      status: "completed",
    });
    expect(ap.item).toMatchObject({ termCode: null, source: "ap", unverified: false });
    expect(await rejection(add(user, { termCode: null, courseCode: "MAT 110" }))).toMatchObject({
      status: 400,
      message: "Pick a term. Only AP and transfer credit can be listed without a term.",
    });
    expect(
      (await rejection(add(user, { termCode: null, courseCode: "MAT 110", source: "ap" }))).message,
    ).toBe("MAT 110 is already in your AP/transfer credit.");
  });

  it("keeps terms between the first term and gradYear+1 (summers included)", async () => {
    const user = await insertStudent();
    expect(await rejection(add(user, { termCode: "202303", courseCode: "CSC 121" }))).toMatchObject(
      {
        status: 400,
        message: "Summer 2024 is outside your plan (Fall 2024 – Summer 2029).",
      },
    );
    expect((await rejection(add(user, { termCode: "202901", courseCode: "CSC 121" }))).status).toBe(
      400,
    );
    await add(user, { termCode: "202401", courseCode: "CSC 121", status: "completed" });
    await add(user, { termCode: "202403", courseCode: "CSC 110", status: "completed" });
    await add(user, { termCode: "202803", courseCode: "CSC 221" });
    const other = await insertStudent({ graduationYear: 2030, firstTerm: "202602" });
    expect(
      (await rejection(add(other, { termCode: "202601", courseCode: "CSC 121" }))).status,
    ).toBe(400);
  });
});

describe("addItem: the duplicate key and retakes", () => {
  it("answers 409 for the same active (term, course), and allows it again once dropped or failed", async () => {
    const user = await insertStudent();
    const first = await add(user, { termCode: "202602", courseCode: "CSC 221" });
    expect(await rejection(add(user, { termCode: "202602", courseCode: "csc 221" }))).toMatchObject(
      {
        status: 409,
        message: "CSC 221 is already in your Spring 2027 plan.",
      },
    );
    await updateItem(user, first.item.id, { status: "dropped" });
    const again = await add(user, { termCode: "202602", courseCode: "CSC 221" });
    await updateItem(user, again.item.id, { status: "failed" });
    await add(user, { termCode: "202602", courseCode: "CSC 221" });
    const statuses = (await getPlan(user)).items.map((i) => i.status);
    expect(statuses).toEqual(["dropped", "failed", "planned"]);
  });

  it("allows the same course in another term, warning about a retake", async () => {
    const user = await insertStudent();
    await add(user, { termCode: "202501", courseCode: "CSC 121", status: "completed" });
    const retake = await add(user, { termCode: "202602", courseCode: "CSC 121" });
    expect(retake.warnings).toContainEqual({
      code: "already-completed",
      message: "Already completed in Fall 2025 — plan a retake?",
      itemId: retake.item.id,
      termCode: "202602",
    });
    // Repeatable ensembles: one per term, no key clash.
    await add(user, { termCode: "202601", courseCode: "MUS 012" });
    const ensemble = await add(user, { termCode: "202602", courseCode: "MUS 012" });
    expect(ensemble.item.credits).toBe(0);
  });

  it("adds inactive history (a dropped course) without taking the key", async () => {
    const user = await insertStudent();
    await add(user, { termCode: "202602", courseCode: "CSC 221", status: "dropped" });
    await add(user, { termCode: "202602", courseCode: "CSC 221", status: "dropped" });
    await add(user, { termCode: "202602", courseCode: "CSC 221" });
    expect((await getPlan(user)).items).toHaveLength(3);
  });
});

describe("addItem: warnings, never blocks", () => {
  it("flags a class-year restriction against the derived standing, or the override", async () => {
    const junior = await insertStudent();
    const restricted = await add(junior, {
      termCode: "202602",
      courseCode: "ART 101",
      crn: "20025",
    });
    expect(restricted.warnings).toEqual([
      {
        code: "restricted-standing",
        message:
          "ART 101 A is limited to first-years and sophomores until the first day of class; you are a junior.",
        itemId: restricted.item.id,
        termCode: "202602",
      },
    ]);
    const other = await insertStudent();
    expect(
      (await add(other, { termCode: "202602", courseCode: "ART 101", crn: "20026" })).warnings,
    ).toEqual([]);
    // Without a section: flagged only when every section excludes the student.
    expect(
      (await add(await insertStudent(), { termCode: "202602", courseCode: "ART 101" })).warnings,
    ).toEqual([]);
    const ant = await add(await insertStudent(), { termCode: "202602", courseCode: "ANT 285" });
    expect(codes(ant.warnings)).toEqual(["restricted-standing", "no-requirement-data"]);
    expect(ant.warnings[0]?.message).toBe(
      "Every section of ANT 285 is limited to first-years and sophomores; you are a junior.",
    );
    expect(ant.warnings[1]?.message).toBe("No requirement data for ANT 285 in Spring 2027.");
    const overridden = await insertStudent({ standingOverride: "first-year" });
    expect(
      (await add(overridden, { termCode: "202602", courseCode: "ART 101", crn: "20025" })).warnings,
    ).toEqual([]);
  });

  it("flags permission-required sections and W sections once COMP is met", async () => {
    const user = await insertStudent();
    const prm = await add(user, { termCode: "202602", courseCode: "CIS 257", crn: "20573" });
    expect(codes(prm.warnings)).toEqual(["permission-required"]);
    await add(user, { termCode: "202501", courseCode: "WRI 101", status: "completed" });
    const w = await add(user, { termCode: "202602", courseCode: "WRI 101", crn: "20519" });
    expect(codes(w.warnings)).toEqual(["already-completed", "comp-met-w-section"]);
    expect(w.warnings[1]?.message).toBe(
      "WRI 101 A is closed to students who have met the writing requirement.",
    );
  });

  it("does not flag registration restrictions on history (completed items)", async () => {
    const user = await insertStudent();
    const done = await add(user, {
      termCode: "202601",
      courseCode: "ART 101",
      crn: "10028",
      status: "in-progress",
    });
    expect(done.warnings).toEqual([]);
  });

  it("flags NSCI (legacy) for verification", async () => {
    const user = await insertStudent();
    const { warnings } = await add(user, {
      termCode: "202601",
      courseCode: "PHY 395",
      crn: "10721",
    });
    expect(codes(warnings)).toEqual(["nsci-verify"]);
  });

  it("flags time conflicts with the student's other sections that term", async () => {
    const user = await insertStudent();
    await add(user, { termCode: "202602", courseCode: "CSC 221", crn: "20135" });
    const spa = await add(user, { termCode: "202602", courseCode: "SPA 201", crn: "20478" });
    expect(spa.warnings.map((w) => w.message)).toEqual([
      "SPA 201 B overlaps CSC 221 (CRN 20135) on Mon 10:30–11:20.",
      "SPA 201 B overlaps CSC 221 (CRN 20135) on Wed 10:30–11:20.",
      "SPA 201 B overlaps CSC 221 (CRN 20135) on Fri 10:30–11:20.",
    ]);
    expect(codes(spa.warnings)).toEqual(["time-conflict", "time-conflict", "time-conflict"]);
  });

  it("warns at the Pass/Fail limits", async () => {
    const user = await insertStudent();
    await add(user, {
      termCode: "202501",
      courseCode: "ECO 101",
      passFail: true,
      status: "completed",
    });
    await add(user, {
      termCode: "202502",
      courseCode: "PSY 101",
      passFail: true,
      status: "completed",
    });
    const sameTerm = await add(user, {
      termCode: "202502",
      courseCode: "SOC 101",
      passFail: true,
      status: "completed",
    });
    expect(codes(sameTerm.warnings)).toEqual(["pass-fail-term"]);
    const fourth = await add(user, { termCode: "202602", courseCode: "CSC 221", passFail: true });
    expect(fourth.warnings).toEqual([
      {
        code: "pass-fail-total",
        message: "This makes 4 Pass/Fail courses; at most 3 may be elected Pass/Fail.",
        itemId: fourth.item.id,
        termCode: "202602",
      },
    ]);
  });
});

describe("updateItem: whitelisted, atomic patches", () => {
  it("patches status, P/F and the note (null clears it)", async () => {
    const user = await insertStudent();
    const { item } = await add(user, {
      termCode: "202601",
      courseCode: "CSC 121",
      note: "with Sam",
    });
    expect(item.note).toBe("with Sam");
    const updated = await updateItem(user, item.id, {
      status: "completed",
      passFail: true,
      note: null,
    });
    expect(updated.item).toMatchObject({ status: "completed", passFail: true });
    expect(updated.item.note).toBeUndefined();
    expect((await getPlan(user)).items[0]).toEqual(updated.item);
    const stored = (await planDoc(user))!.items as Record<string, unknown>[];
    expect(stored[0]).not.toHaveProperty("note");
  });

  it("choosing a CRN takes the section's facts; moving a term drops the CRN and re-reads the catalog", async () => {
    const user = await insertStudent();
    const { item } = await add(user, { termCode: "202602", courseCode: "WRI 101" });
    const chosen = await updateItem(user, item.id, { crn: "20521" });
    expect(chosen.item).toMatchObject({ crn: "20521", title: "Religion in the Public Square" });
    const moved = await updateItem(user, item.id, { termCode: "202701" });
    expect(moved.item.crn).toBeUndefined();
    expect(moved.item).toMatchObject({
      termCode: "202701",
      title: "Writing Program: topics vary by section",
    });
    const cleared = await updateItem(
      user,
      (await add(user, { termCode: "202602", courseCode: "CSC 221", crn: "20135" })).item.id,
      { crn: null },
    );
    expect(cleared.item.crn).toBeUndefined();
    expect(cleared.item.title).toBe("Data Structures");
  });

  it("answers 409 when the new term or status takes an active key", async () => {
    const user = await insertStudent();
    await add(user, { termCode: "202602", courseCode: "CSC 221" });
    const other = await add(user, { termCode: "202701", courseCode: "CSC 221" });
    expect(await rejection(updateItem(user, other.item.id, { termCode: "202602" }))).toMatchObject({
      status: 409,
      message: "CSC 221 is already in your Spring 2027 plan.",
    });
    const dropped = await add(user, {
      termCode: "202602",
      courseCode: "CSC 221",
      status: "dropped",
    });
    expect((await rejection(updateItem(user, dropped.item.id, { status: "planned" }))).status).toBe(
      409,
    );
    // Moving within the item's own key is fine.
    await updateItem(user, other.item.id, { termCode: "202701", status: "registered" });
  });

  it("validates like the route: unknown fields, empty patches, CRNs, terms", async () => {
    const user = await insertStudent();
    const { item } = await add(user, { termCode: "202602", courseCode: "CSC 221" });
    const bad = await rejection(
      updateItem(user, item.id, { courseCode: "HACK 1" } as unknown as { status: "planned" }),
    );
    expect(bad).toMatchObject({ status: 400, code: "validation_failed" });
    expect((await rejection(updateItem(user, item.id, {}))).status).toBe(400);
    expect((await rejection(updateItem(user, item.id, { crn: "20519" }))).message).toBe(
      "CRN 20519 is WRI 101 A, not CSC 221.",
    );
    expect((await rejection(updateItem(user, item.id, { termCode: "209901" }))).status).toBe(400);
    expect((await rejection(updateItem(user, item.id, { termCode: null }))).message).toBe(
      "Pick a term. Only AP and transfer credit can be listed without a term.",
    );
  });

  it("answers 404 for an unknown item or a student without a plan", async () => {
    const user = await insertStudent();
    const id = new mongoose.Types.ObjectId().toHexString();
    expect((await rejection(updateItem(user, id, { status: "completed" }))).status).toBe(404);
    expect(await planDoc(user)).toBeNull();
    await add(user, { termCode: "202602", courseCode: "CSC 221" });
    expect(await rejection(updateItem(user, id, { status: "completed" }))).toMatchObject({
      status: 404,
      message: "That course is not in your plan.",
    });
  });
});

describe("removeItem", () => {
  it("$pulls by id; a missing id is a no-op and creates no plan", async () => {
    const user = await insertStudent();
    await removeItem(user, new mongoose.Types.ObjectId().toHexString());
    await removeItem(user, "not-an-id");
    expect(await planDoc(user)).toBeNull();
    const a = await add(user, { termCode: "202602", courseCode: "CSC 221" });
    const b = await add(user, { termCode: "202602", courseCode: "MAT 150" });
    await removeItem(user, a.item.id);
    await removeItem(user, a.item.id);
    expect((await getPlan(user)).items.map((i) => i.id)).toEqual([b.item.id]);
  });
});

describe("atomicity", () => {
  it("20 parallel adds of the same course store exactly one", async () => {
    const user = await insertStudent();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => add(user, { termCode: "202602", courseCode: "CSC 221" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(19);
    for (const r of rejected) expect(r.reason).toMatchObject({ status: 409, code: "conflict" });
    const doc = await planDoc(user);
    expect((doc!.items as unknown[]).length).toBe(1);
    expect(await Plan.countDocuments({ userId: new mongoose.Types.ObjectId(user) })).toBe(1);
  });

  it("parallel adds of different courses, patches and removes lose nothing", async () => {
    const user = await insertStudent();
    const courses = [
      "CSC 121",
      "CSC 221",
      "MAT 150",
      "ECO 101",
      "PSY 101",
      "SPA 201",
      "HIS 124",
      "WRI 101",
    ];
    const added = await Promise.all(
      courses.map((courseCode) => add(user, { termCode: "202602", courseCode })),
    );
    expect((await getPlan(user)).items).toHaveLength(courses.length);
    await Promise.all(
      added
        .slice(0, 4)
        .map(({ item }) => updateItem(user, item.id, { status: "registered", passFail: false })),
    );
    await Promise.all(added.slice(4, 6).map(({ item }) => removeItem(user, item.id)));
    const items = (await getPlan(user)).items;
    expect(items.map((i) => i.courseCode).sort()).toEqual(
      ["CSC 121", "CSC 221", "ECO 101", "HIS 124", "MAT 150", "WRI 101"].sort(),
    );
    expect(items.filter((i) => i.status === "registered")).toHaveLength(4);
  });

  it("never reads, modifies and saves a document", async () => {
    const save = vi.spyOn(mongoose.Model.prototype, "save");
    const user = await insertStudent();
    const { item } = await add(user, { termCode: "202602", courseCode: "CSC 221" });
    await updateItem(user, item.id, { status: "registered" });
    await removeItem(user, item.id);
    expect(save).not.toHaveBeenCalled();
  });

  it("caps the plan at 200 items in the update filter", async () => {
    const user = await insertStudent();
    const oid = new mongoose.Types.ObjectId(user);
    const filler = Array.from({ length: 200 }, (_, i) => ({
      _id: new mongoose.Types.ObjectId(),
      termCode: "202401",
      courseCode: "MUS 012",
      canonicalCode: "MUS 012",
      title: `Ensemble ${i}`,
      credits: 0,
      status: "dropped",
      passFail: false,
      source: "catalog",
      unverified: false,
    }));
    await Plan.collection.insertOne({
      userId: oid,
      version: 2,
      items: filler,
      summer: [],
      deadlines: [],
      webtree: [],
      drafts: [],
    });
    expect(await rejection(add(user, { termCode: "202602", courseCode: "CSC 221" }))).toMatchObject(
      {
        status: 409,
        message: "Your plan holds the maximum of 200 courses. Remove some before adding more.",
      },
    );
  });
});
