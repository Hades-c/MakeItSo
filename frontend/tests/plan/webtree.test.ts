import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { insertStudent, planDoc, withPlanDb } from "./helpers";
import { AddPlanItemBodySchema } from "@/lib/api/plan";
import { WebTreeListSchema, type WebTreeList } from "@/lib/types/plan";
import Plan from "@/models/Plan";
import { ApiError } from "@/server/http/errors";
import { addItem, getWebTreeList, getWebTreeReport, saveWebTreeList } from "@/server/plan";
import { formatWebTreeCopy, registrationDeadlines, structuralIssues } from "@/server/plan/webtree";

/**
 * The WebTree list (PLAN §5 "WebTree list") for the registration term, Spring 2027: validation against the term's
 * sections, atomic replace, conflicts across choices and alternates, seats, requirement slots, restriction flags,
 * "Copy for WebTree" and the calendar deadlines (opens 2026-10-12 07:00 ET, closes 11-03 17:00, schedules 11-06,
 * add/drop 11-09..13). MakeItSo never submits anything to WebTree.
 */

withPlanDb();

const LIST: WebTreeList = {
  termCode: "202602",
  choices: [
    { rank: 2, crn: "20478", courseCode: "SPA 201", alternates: ["20479"] },
    { rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] },
    { rank: 3, crn: "20301", courseCode: "MAT 150", alternates: ["20025"] },
  ],
};

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

describe("saving and reading", () => {
  it("saves a valid list sorted by rank and reads it back; no list reads as empty", async () => {
    const user = await insertStudent();
    expect(await getWebTreeList(user, "202602")).toEqual({ termCode: "202602", choices: [] });
    const saved = await saveWebTreeList(user, LIST);
    expect(WebTreeListSchema.parse(saved)).toEqual(saved);
    expect(saved.choices.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(await getWebTreeList(user, "202602")).toEqual(saved);
    expect(await getWebTreeList(user, "202701")).toEqual({ termCode: "202701", choices: [] });
  });

  it("replaces the term's list atomically (one entry per term, even under parallel saves)", async () => {
    const user = await insertStudent();
    const shorter: WebTreeList = { termCode: "202602", choices: [LIST.choices[1]!] };
    await Promise.all([
      saveWebTreeList(user, LIST),
      saveWebTreeList(user, shorter),
      saveWebTreeList(user, LIST),
    ]);
    await saveWebTreeList(user, shorter);
    await saveWebTreeList(user, {
      termCode: "202601",
      choices: [{ rank: 1, crn: "10141", courseCode: "CSC 121", alternates: [] }],
    });
    const doc = await planDoc(user);
    const lists = doc!.webtree as { termCode: string }[];
    expect(lists.map((l) => l.termCode)).toEqual(["202601", "202602"]);
    expect(await getWebTreeList(user, "202602")).toEqual({
      termCode: "202602",
      choices: [{ ...LIST.choices[1]!, rank: 1 }],
    });
  });

  it("rejects duplicate ranks and CRNs, unknown CRNs and CRNs of another course", async () => {
    const user = await insertStudent();
    expect(
      structuralIssues({
        termCode: "202602",
        choices: [
          { rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["20136"] },
          { rank: 1, crn: "20136", courseCode: "CSC 221", alternates: [] },
        ],
      }),
    ).toEqual([
      { path: "choices.1.rank", message: "Rank 1 is used twice." },
      { path: "choices.1.crn", message: "CRN 20136 is already listed (choices.0.alternates.0)." },
    ]);
    const error = await rejection(
      saveWebTreeList(user, {
        termCode: "202602",
        choices: [
          { rank: 1, crn: "99999", courseCode: "CSC 221", alternates: [] },
          { rank: 2, crn: "20519", courseCode: "CSC 221", alternates: ["88888"] },
        ],
      }),
    );
    expect(error).toMatchObject({ status: 400, code: "validation_failed" });
    expect(error.issues).toEqual([
      { path: "choices.0.crn", message: "CRN 99999 is not a Spring 2027 section." },
      { path: "choices.1.courseCode", message: "CRN 20519 is WRI 101 A, not CSC 221." },
      { path: "choices.1.alternates.0", message: "CRN 88888 is not a Spring 2027 section." },
    ]);
    expect(await planDoc(user)).toBeNull();
  });

  it("accepts a cross-listed sibling's code for a CRN", async () => {
    const user = await insertStudent();
    const saved = await saveWebTreeList(user, {
      termCode: "202601",
      choices: [{ rank: 1, crn: "10227", courseCode: "PHY 214", alternates: [] }],
    });
    expect(saved.choices[0]).toMatchObject({ crn: "10227", courseCode: "PHY 214" });
  });
});

describe("the report", () => {
  it("defaults to the registration term and reports conflicts across choices, not within one", async () => {
    const user = await insertStudent();
    await saveWebTreeList(user, LIST);
    const report = await getWebTreeReport(user);
    expect(report.list.termCode).toBe("202602");
    expect(
      report.conflicts.map(
        (c) =>
          `${c.a.courseCode} ${c.a.crn}×${c.b.courseCode} ${c.b.crn} ${c.day} ${c.start}-${c.end}`,
      ),
    ).toEqual([
      "CSC 221 20135×SPA 201 20478 M 10:30-11:20",
      "CSC 221 20135×SPA 201 20478 W 10:30-11:20",
      "CSC 221 20135×SPA 201 20478 F 10:30-11:20",
      "CSC 221 20136×SPA 201 20479 M 11:30-12:20",
      "CSC 221 20136×SPA 201 20479 W 11:30-12:20",
      "CSC 221 20136×SPA 201 20479 F 11:30-12:20",
    ]);
    // MAT 150 A and its alternate ART 101 A meet at the same time: either/or, not a conflict.
  });

  it("details seats, slots and flags per choice and alternate, and copies plain text", async () => {
    const user = await insertStudent();
    await addItem(user, AddPlanItemBodySchema.parse({ termCode: "202602", courseCode: "HIS 124" }));
    await saveWebTreeList(user, LIST);
    const report = await getWebTreeReport(user, "202602");
    const [first, second, third] = report.details;
    expect(first).toMatchObject({
      rank: 1,
      choice: {
        crn: "20135",
        found: true,
        courseCode: "CSC 221",
        section: "A",
        title: "Data Structures",
        credits: 1,
        seats: { current: 0, max: 24, remaining: 24, open: 24, overEnrolled: false, pressure: 0 },
        registerAs: null,
        slots: [{ slot: "MQRQ", code: "MQRQ", status: "open" }],
        flags: [],
      },
    });
    expect(first?.alternates.map((a) => a.crn)).toEqual(["20136"]);
    expect(second?.choice.slots).toEqual([{ slot: "FRLG", code: "FRLG", status: "open" }]);
    // ART 101 A is limited to first-years and sophomores: flagged, never blocked.
    expect(third?.alternates[0]?.flags).toEqual([
      {
        code: "restricted-standing",
        message:
          "ART 101 A is limited to first-years and sophomores until the first day of class; you are a junior.",
        termCode: "202602",
      },
    ]);
    expect(report.warnings).toEqual(third?.alternates[0]?.flags);
    expect(report.copyText).toBe(
      [
        "Spring 2027 WebTree preferences (from MakeItSo; unofficial: enter them in WebTree yourself)",
        "1. CRN 20135  CSC 221 A  Data Structures",
        "   Alternates: CRN 20136  CSC 221 B  Data Structures",
        "2. CRN 20478  SPA 201 B  Developing Span Lang Hisp Cult",
        "   Alternates: CRN 20479  SPA 201 C  Developing Span Lang Hisp Cult",
        "3. CRN 20301  MAT 150 A  Linear Algebra",
        "   Alternates: CRN 20025  ART 101 A  Basic Drawing",
      ].join("\n"),
    );
  });

  it("shows a slot's status from the plan", async () => {
    const user = await insertStudent();
    await addItem(
      user,
      AddPlanItemBodySchema.parse({
        termCode: "202501",
        courseCode: "CSC 121",
        status: "completed",
      }),
    );
    await saveWebTreeList(user, { termCode: "202602", choices: [LIST.choices[1]!] });
    const report = await getWebTreeReport(user);
    expect(report.details[0]?.choice.slots).toEqual([
      { slot: "MQRQ", code: "MQRQ", status: "done" },
    ]);
  });

  it("registers a 'max 0' listing as its sibling (seats and copy use PHY 214 A for ENV 214 A)", async () => {
    const user = await insertStudent({ graduationYear: 2030, firstTerm: "202601" });
    await saveWebTreeList(user, {
      termCode: "202601",
      choices: [{ rank: 1, crn: "10227", courseCode: "ENV 214", alternates: [] }],
    });
    const report = await getWebTreeReport(user, "202601");
    expect(report.details[0]?.choice).toMatchObject({
      crn: "10227",
      courseCode: "ENV 214",
      registerAs: { crn: "10393", courseCode: "PHY 214", section: "A" },
      seats: { current: 8, max: 12, remaining: 4, open: 4, pressure: 0.67 },
    });
    expect(report.copyText.split("\n")[1]).toBe(
      "1. CRN 10393  PHY 214 A (listed as ENV 214 A)  Energy,Environ,EnginDesign+Lab",
    );
    expect(report.warnings).toEqual([]);
  });

  it("warns about sections no longer offered, W sections once COMP is met, and retakes", async () => {
    const user = await insertStudent();
    await addItem(
      user,
      AddPlanItemBodySchema.parse({
        termCode: "202501",
        courseCode: "WRI 101",
        status: "completed",
      }),
    );
    await addItem(
      user,
      AddPlanItemBodySchema.parse({
        termCode: "202501",
        courseCode: "CSC 221",
        status: "completed",
      }),
    );
    await Plan.updateOne(
      { userId: new mongoose.Types.ObjectId(user) },
      {
        $push: {
          webtree: {
            termCode: "202602",
            choices: [
              { rank: 1, crn: "20135", courseCode: "CSC 221", alternates: ["99999"] },
              { rank: 2, crn: "20519", courseCode: "WRI 101", alternates: [] },
            ],
          },
        },
      },
    );
    const report = await getWebTreeReport(user);
    expect(report.warnings).toEqual([
      {
        code: "unverified-course",
        message: "CRN 99999 (CSC 221) is no longer in the Spring 2027 schedule.",
        termCode: "202602",
      },
      {
        code: "already-completed",
        message: "CSC 221: already completed in Fall 2025 — plan a retake?",
        termCode: "202602",
      },
      {
        code: "comp-met-w-section",
        message: "WRI 101 A is closed to students who have met the writing requirement.",
        termCode: "202602",
      },
      {
        code: "already-completed",
        message: "WRI 101: already completed in Fall 2025 — plan a retake?",
        termCode: "202602",
      },
    ]);
    expect(report.details[0]?.alternates[0]).toMatchObject({
      crn: "99999",
      found: false,
      seats: null,
    });
    expect(report.copyText).toContain(
      "Alternates: CRN 99999  CSC 221  (no longer in the schedule)",
    );
  });

  it("carries the registration deadlines from the academic calendar", async () => {
    const user = await insertStudent();
    const report = await getWebTreeReport(user);
    expect(report.deadlines.map((d) => [d.id, d.date, d.endDate, d.time, d.source])).toEqual([
      ["calendar:f26-webtree-spring27", "2026-10-12", "2026-11-03", "07:00", "registrar"],
      ["calendar:f26-webtree-closes", "2026-11-03", null, "17:00", "registrar"],
      ["calendar:f26-schedules-available", "2026-11-06", null, "17:00", "registrar"],
      ["calendar:f26-adddrop-november", "2026-11-09", "2026-11-13", "07:00", "registrar"],
      ["calendar:f26-adddrop-ends", "2026-11-13", null, "17:00", "registrar"],
    ]);
    expect(registrationDeadlines("202701").map((d) => d.id)).toEqual([
      "calendar:s27-webtree-fall27",
    ]);
    expect(registrationDeadlines("203001")).toEqual([]);
    expect(report.copyText).toBe(
      "Spring 2027 WebTree preferences (from MakeItSo; unofficial: enter them in WebTree yourself)\n(no choices yet)",
    );
  });

  it("formats the copy text purely", () => {
    expect(formatWebTreeCopy("202701", [])).toBe(
      "Fall 2027 WebTree preferences (from MakeItSo; unofficial: enter them in WebTree yourself)\n(no choices yet)",
    );
  });

  it("rejects a malformed term", async () => {
    const user = await insertStudent();
    expect((await rejection(getWebTreeList(user, "2026"))).status).toBe(400);
    expect((await rejection(getWebTreeReport(user, "000001"))).status).toBe(400);
  });
});
