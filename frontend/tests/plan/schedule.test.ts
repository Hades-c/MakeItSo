import { describe, expect, it } from "vitest";
import { insertStudent, withPlanDb } from "./helpers";
import { AddPlanItemBodySchema, type AddPlanItemBody } from "@/lib/api/plan";
import { DayScheduleSchema } from "@/lib/types/plan";
import { resolveTerms } from "@/server/catalog";
import { ApiError } from "@/server/http/errors";
import { addDeadline, addItem, getDaySchedule, type DayScheduleResult } from "@/server/plan";
import { classDay, termOnDate } from "@/server/plan/schedule";

/**
 * getDaySchedule (PLAN §3 Today timeline): the student's class meetings on one America/New_York date from the
 * current term's CRNs (second meetings in, TBA listed apart), breaks and class days from the Registrar calendar,
 * DST-correct instants, plus the student's deadlines due that day.
 */

withPlanDb();

const add = (userId: string, body: AddPlanItemBody) =>
  addItem(userId, AddPlanItemBodySchema.parse({ status: "in-progress", ...body }));

async function fallStudent(): Promise<string> {
  const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
  await add(user, { termCode: "202601", courseCode: "CSC 121", crn: "10141" }); // MWF 09:30-10:20
  await add(user, { termCode: "202601", courseCode: "BIO 115", crn: "10049" }); // MWF 08:30 + M 13:30 lab
  await add(user, { termCode: "202601", courseCode: "EDU 330", crn: "10617" }); // TR 12:15-13:30
  await add(user, { termCode: "202601", courseCode: "ANT 498", crn: "10753" }); // TBA
  await add(user, { termCode: "202601", courseCode: "CSC 221", crn: "10144", status: "dropped" }); // MWF 10:30
  await add(user, { termCode: "202601", courseCode: "ECO 101" }); // no CRN
  return user;
}

async function schedule(user: string, date: string): Promise<DayScheduleResult> {
  const result = (await getDaySchedule(user, date)) as DayScheduleResult;
  DayScheduleSchema.parse(result);
  return result;
}

const lines = (result: DayScheduleResult) =>
  result.entries.map((e) => `${e.start}-${e.end} ${e.courseCode} ${e.kind} ${e.startsAt}`);

describe("a class day", () => {
  it("lists Wednesday's meetings in order with ET instants, TBA sections apart", async () => {
    const user = await fallStudent();
    const result = await schedule(user, "2026-09-30");
    expect(result).toMatchObject({
      date: "2026-09-30",
      termCode: "202601",
      empty: null,
      deadlines: [],
    });
    expect(lines(result)).toEqual([
      "08:30-09:20 BIO 115 class 2026-09-30T12:30:00.000Z",
      "09:30-10:20 CSC 121 class 2026-09-30T13:30:00.000Z",
    ]);
    expect(result.entries[1]).toMatchObject({
      crn: "10141",
      title: "Programming & Problem Solving",
      endsAt: "2026-09-30T14:20:00.000Z",
    });
    expect(result.tba).toEqual([{ crn: "10753", courseCode: "ANT 498", title: "Honors Thesis" }]);
  });

  it("includes second meeting times (Monday's lab) and Tuesday/Thursday classes", async () => {
    const user = await fallStudent();
    expect(lines(await schedule(user, "2026-09-28"))).toEqual([
      "08:30-09:20 BIO 115 class 2026-09-28T12:30:00.000Z",
      "09:30-10:20 CSC 121 class 2026-09-28T13:30:00.000Z",
      "13:30-16:20 BIO 115 second 2026-09-28T17:30:00.000Z",
    ]);
    expect(lines(await schedule(user, "2026-10-01"))).toEqual([
      "12:15-13:30 EDU 330 class 2026-10-01T16:15:00.000Z",
    ]);
  });

  it("uses EST after DST ends (2026-11-01)", async () => {
    const user = await fallStudent();
    expect(lines(await schedule(user, "2026-11-02"))[1]).toBe(
      "09:30-10:20 CSC 121 class 2026-11-02T14:30:00.000Z",
    );
  });

  it("adds the student's deadlines due that day in America/New_York", async () => {
    const user = await fallStudent();
    const late = await addDeadline(user, {
      title: "Lab report",
      dueAt: "2026-09-30T23:59:00-04:00",
      courseCode: "BIO 115",
    });
    const evening = await addDeadline(user, { title: "Reading", dueAt: "2026-10-01T02:00:00Z" });
    await addDeadline(user, { title: "Tomorrow", dueAt: "2026-10-01T05:00:00Z" });
    expect((await schedule(user, "2026-09-30")).deadlines).toEqual(
      [evening, late].sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    );
  });
});

describe("days without classes", () => {
  it.each([
    ["2026-10-03", "weekend"],
    ["2026-10-04", "weekend"],
    ["2026-09-21", "break"], // Fall Break
    ["2026-11-24", "break"], // Thanksgiving Break
    ["2026-12-09", "no-classes-today"], // Reading day, after the last class day
    ["2026-12-10", "no-classes-today"], // Final assessment period
  ])("%s → %s", async (date, empty) => {
    const user = await fallStudent();
    const result = await schedule(user, date);
    expect(result).toMatchObject({ termCode: "202601", entries: [], empty });
  });

  it("answers no-term between terms and no-sections without CRNs", async () => {
    const user = await fallStudent();
    expect(await schedule(user, "2026-12-20")).toMatchObject({
      termCode: null,
      entries: [],
      tba: [],
      empty: "no-term",
    });
    const noCrn = await insertStudent();
    await add(noCrn, { termCode: "202601", courseCode: "CSC 121" });
    expect(await schedule(noCrn, "2026-09-30")).toMatchObject({
      termCode: "202601",
      empty: "no-sections",
    });
    expect(await schedule(await insertStudent(), "2026-10-03")).toMatchObject({ empty: "weekend" });
  });

  it("keeps the classes before a break that starts at a time (Thanksgiving, Fri 4:20 p.m.)", async () => {
    const { terms } = await resolveTerms();
    expect(
      classDay(
        { terms, current: "202601", registration: "202602", asOf: null },
        "202601",
        "2026-11-20",
      ),
    ).toMatchObject({
      weekday: "F",
      reason: null,
      cutoff: "16:20",
    });
    const user = await fallStudent();
    expect(lines(await schedule(user, "2026-11-20"))).toEqual([
      "08:30-09:20 BIO 115 class 2026-11-20T13:30:00.000Z",
      "09:30-10:20 CSC 121 class 2026-11-20T14:30:00.000Z",
    ]);
  });

  it("rejects a malformed date", async () => {
    const user = await fallStudent();
    const error = await getDaySchedule(user, "2026-02-30").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400 });
  });
});

describe("spring", () => {
  async function springStudent(): Promise<string> {
    const user = await insertStudent({ graduationYear: 2029, firstTerm: "202501" });
    await add(user, {
      termCode: "202602",
      courseCode: "CSC 221",
      crn: "20135",
      status: "registered",
    }); // MWF 10:30
    await add(user, {
      termCode: "202602",
      courseCode: "MAT 150",
      crn: "20301",
      status: "registered",
    }); // TR 12:15
    return user;
  }

  it("follows the Monday schedule on 'Classes Follow Monday Schedule' (Tue 2027-04-20)", async () => {
    const user = await springStudent();
    expect(lines(await schedule(user, "2027-04-20"))).toEqual([
      "10:30-11:20 CSC 221 class 2027-04-20T14:30:00.000Z",
    ]);
  });

  it("switches to EDT after 2027-03-14 and has no classes over Spring Break", async () => {
    const user = await springStudent();
    expect(lines(await schedule(user, "2027-03-05"))).toEqual([
      "10:30-11:20 CSC 221 class 2027-03-05T15:30:00.000Z",
    ]);
    expect(lines(await schedule(user, "2027-03-15"))).toEqual([
      "10:30-11:20 CSC 221 class 2027-03-15T14:30:00.000Z",
    ]);
    expect((await schedule(user, "2027-03-10")).empty).toBe("break");
  });

  it("finds the term in session from the Banner dates", async () => {
    const resolved = await resolveTerms();
    expect(termOnDate(resolved, "2026-09-30")).toBe("202601");
    expect(termOnDate(resolved, "2027-01-19")).toBe("202602");
    expect(termOnDate(resolved, "2027-01-01")).toBeNull();
  });
});
