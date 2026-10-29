import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURES_NOW, insertStudent, withSyllabiDb } from "./helpers";
import Plan from "@/models/Plan";
import SyllabusModel from "@/models/Syllabus";
import {
  accountDataNames,
  eraseAccountData,
  exportAccountData,
  loadAccountDataRegistrations,
} from "@/server/account/erasers";
import type { ExtractedDeadline } from "@/lib/types/syllabus";
import { addSyllabusDeadlines, listDeadlines } from "@/server/plan";
import { setMockAiScenario } from "@/server/ai/mock";
import { parseDateKey, zonedTimeToUtc } from "@/server/feeds/time";
import {
  addSyllabus,
  countSyllabi,
  deleteSyllabus,
  getSyllabus,
  listSyllabi,
  syllabusTerms,
} from "@/server/syllabi";
import { MAX_SYLLABI } from "@/server/syllabi/store";
import { TEST_SECRET } from "../w3/helpers";

withSyllabiDb();

let clock = 0;
beforeEach(() => {
  vi.stubEnv("AI_PROVIDER", "mock");
  // The AI quota keys on a hash made with the session secret.
  vi.stubEnv("NEXTAUTH_SECRET", TEST_SECRET);
  clock = 0;
  tick();
});
afterEach(() => vi.unstubAllEnvs());

/** Move server now() a minute on, so each syllabus added has its own time (the list is newest first). */
function tick(): void {
  vi.stubEnv("FIXTURES_NOW", new Date(Date.parse(FIXTURES_NOW) + clock++ * 60_000).toISOString());
}

const SYLLABUS_TEXT = "CSC 221\nMidterm exam on October 15.\nFinal paper due December 3.";

async function paste(userId: string, courseCode = "CSC 221", termCode = "202601") {
  tick();
  const result = await addSyllabus(userId, { courseCode, termCode, text: SYLLABUS_TEXT });
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
  return result.data.syllabus;
}

/** What POST /api/syllabi/[id]/deadlines saves: each day at 23:59 Davidson time. */
function asPlanDeadlines(deadlines: readonly ExtractedDeadline[]) {
  return deadlines.map((d) => ({
    title: d.title,
    dueAt: zonedTimeToUtc(
      { ...parseDateKey(d.dueAt), hour: 23, minute: 59 },
      "America/New_York",
    ).toISOString(),
    courseCode: "CSC 221",
  }));
}

describe("addSyllabus", () => {
  it("extracts and stores the syllabus's course, term and deadlines, never the pasted text", async () => {
    const userId = await insertStudent();
    const syllabus = await paste(userId);
    expect(syllabus).toMatchObject({
      courseCode: "CSC 221",
      termCode: "202601",
      planDeadlineCount: 0,
    });
    expect(syllabus.extractedDeadlines).toEqual([
      { title: "Midterm Exam", dueAt: "2026-10-15" },
      { title: "Final Paper", dueAt: "2026-12-03" },
    ]);
    const doc = await SyllabusModel.findById(syllabus.id).lean();
    expect(JSON.stringify(doc)).not.toContain("Midterm exam on");
    expect(Object.keys(doc!).sort()).toEqual(
      [
        "__v",
        "_id",
        "addedAt",
        "courseCode",
        "createdAt",
        "extractedDeadlines",
        "termCode",
        "updatedAt",
        "userId",
      ].sort(),
    );
  });

  it("writes nothing when the AI call fails (a quota or consent failure leaves syllabi untouched)", async () => {
    const userId = await insertStudent();
    setMockAiScenario("timeout", { times: 1 });
    const result = await addSyllabus(userId, {
      courseCode: "CSC 221",
      termCode: "202601",
      text: SYLLABUS_TEXT,
    });
    expect(result.kind).toBe("timeout");
    expect(await listSyllabi(userId)).toEqual([]);
  });

  it("replacing a syllabus for the same course and term keeps its id but drops its plan deadlines", async () => {
    const userId = await insertStudent();
    const first = await paste(userId);
    await addSyllabusDeadlines(userId, first.id, asPlanDeadlines(first.extractedDeadlines));
    expect(await listDeadlines(userId)).toHaveLength(2);
    expect((await listSyllabi(userId))[0]?.planDeadlineCount).toBe(2);

    const replaced = await paste(userId);
    expect(replaced.id).toBe(first.id);
    expect(await listSyllabi(userId)).toHaveLength(1);
    // The old syllabus's deadlines are gone from the plan; nothing new was added until review-and-save runs again.
    expect(await listDeadlines(userId)).toEqual([]);
  });

  it("keeps syllabi for different students, and for different courses or terms, separate", async () => {
    const a = await insertStudent();
    const b = await insertStudent();
    await paste(a, "CSC 221", "202601");
    await paste(a, "CSC 221", "202602");
    await paste(b, "CSC 221", "202601");
    expect(await listSyllabi(a)).toHaveLength(2);
    expect(await listSyllabi(b)).toHaveLength(1);
    expect(await countSyllabi(a)).toBe(2);
  });

  it("takes the current term (the default) or the next one only", async () => {
    expect((await syllabusTerms()).map((term) => [term.code, term.label])).toEqual([
      ["202601", "Fall 2026"],
      ["202602", "Spring 2027"],
    ]);
    const userId = await insertStudent();
    await expect(
      addSyllabus(userId, { courseCode: "CSC 221", termCode: "202502", text: SYLLABUS_TEXT }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/Fall 2026 or Spring 2027, not Spring 2026/),
    });
    expect(await listSyllabi(userId)).toEqual([]);
  });

  it("enforces MAX_SYLLABI for a genuinely new syllabus, not a replace", async () => {
    const userId = await insertStudent();
    const oid = new mongoose.Types.ObjectId(userId);
    await SyllabusModel.insertMany(
      Array.from({ length: MAX_SYLLABI }, (_, i) => ({
        userId: oid,
        courseCode: `AAA ${100 + i}`,
        termCode: "202601",
        addedAt: new Date(),
        extractedDeadlines: [],
      })),
    );
    await expect(
      addSyllabus(userId, { courseCode: "ZZZ 999", termCode: "202601", text: SYLLABUS_TEXT }),
    ).rejects.toMatchObject({ status: 409 });
    // Replacing one of the existing syllabi is still allowed: it is not a new slot.
    const replaced = await paste(userId, "AAA 100", "202601");
    expect(replaced.courseCode).toBe("AAA 100");
  });

  it("rejects an invalid course code or term before calling the AI", async () => {
    const userId = await insertStudent();
    await expect(
      addSyllabus(userId, { courseCode: "not a code", termCode: "202601", text: SYLLABUS_TEXT }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("listSyllabi / getSyllabus / deleteSyllabus", () => {
  it("lists syllabi newest first", async () => {
    const userId = await insertStudent();
    await paste(userId, "CSC 221", "202601");
    await paste(userId, "ENG 260", "202601");
    const list = await listSyllabi(userId);
    expect(list.map((s) => s.courseCode)).toEqual(["ENG 260", "CSC 221"]);
  });

  it("getSyllabus only finds a syllabus that belongs to this student", async () => {
    const owner = await insertStudent();
    const other = await insertStudent();
    const syllabus = await paste(owner);
    expect(await getSyllabus(owner, syllabus.id)).toMatchObject({ id: syllabus.id });
    expect(await getSyllabus(other, syllabus.id)).toBeNull();
    expect(await getSyllabus(owner, "650000000000000000000000")).toBeNull();
  });

  it("deleting a syllabus also removes the plan deadlines that trace back to it, nothing else", async () => {
    const userId = await insertStudent();
    const syllabus = await paste(userId);
    await addSyllabusDeadlines(userId, syllabus.id, asPlanDeadlines(syllabus.extractedDeadlines));
    await Plan.updateOne(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $push: { deadlines: { title: "By hand", dueAt: new Date(), origin: "manual" } } },
    );
    expect(await listDeadlines(userId)).toHaveLength(3);

    await deleteSyllabus(userId, syllabus.id);
    expect(await listSyllabi(userId)).toEqual([]);
    const remaining = await listDeadlines(userId);
    expect(remaining.map((d) => d.title)).toEqual(["By hand"]);
  });

  it("deleting an id that is not there, or not this student's, is a no-op", async () => {
    const owner = await insertStudent();
    const other = await insertStudent();
    const syllabus = await paste(owner);
    await deleteSyllabus(other, syllabus.id);
    expect(await listSyllabi(owner)).toHaveLength(1);
    await expect(deleteSyllabus(owner, "650000000000000000000000")).resolves.toBeUndefined();
  });
});

describe("addSyllabusDeadlines (review-before-save)", () => {
  it("saving the same review twice adds nothing the second time", async () => {
    const userId = await insertStudent();
    const syllabus = await paste(userId);
    const chosen = asPlanDeadlines(syllabus.extractedDeadlines);
    const first = await addSyllabusDeadlines(userId, syllabus.id, chosen);
    expect(first.added).toBe(2);
    const second = await addSyllabusDeadlines(userId, syllabus.id, chosen);
    expect(second).toEqual({ deadlines: first.deadlines, added: 0 });
    expect(await listDeadlines(userId)).toHaveLength(2);
    // A syllabus gives a day, not a time: saved and read back as all-day.
    expect(first.deadlines.every((d) => d.allDay === true)).toBe(true);
    expect(await listDeadlines(userId)).toEqual(first.deadlines);
  });

  it("adds only the new ones of a review that repeats a row, and counts them", async () => {
    const userId = await insertStudent();
    const syllabus = await paste(userId);
    const [midterm, final] = asPlanDeadlines(syllabus.extractedDeadlines);
    await addSyllabusDeadlines(userId, syllabus.id, [midterm!]);
    const result = await addSyllabusDeadlines(userId, syllabus.id, [midterm!, final!, final!]);
    expect(result.added).toBe(1);
    expect(result.deadlines.map((d) => d.title)).toEqual(["Midterm Exam", "Final Paper"]);
    expect(await listDeadlines(userId)).toHaveLength(2);
  });

  it("two saves at once still add each deadline once", async () => {
    const userId = await insertStudent();
    const syllabus = await paste(userId);
    const chosen = asPlanDeadlines(syllabus.extractedDeadlines);
    const results = await Promise.all([
      addSyllabusDeadlines(userId, syllabus.id, chosen),
      addSyllabusDeadlines(userId, syllabus.id, chosen),
    ]);
    expect(results.map((r) => r.added).sort()).toEqual([0, 2]);
    expect(await listDeadlines(userId)).toHaveLength(2);
  });
});

describe("account data registry", () => {
  it("registers 'syllabi' for export and erase", async () => {
    await loadAccountDataRegistrations();
    expect(accountDataNames()).toContain("syllabi");

    const userId = await insertStudent();
    await paste(userId);
    const exported = (await exportAccountData(userId)).syllabi as { courseCode: string }[];
    expect(exported.map((s) => s.courseCode)).toEqual(["CSC 221"]);

    const removed = await eraseAccountData(userId);
    expect(removed.syllabi).toBe(1);
    expect(await listSyllabi(userId)).toEqual([]);
  });

  it("exports and erases nothing for an invalid id, rather than throwing", async () => {
    expect((await exportAccountData("not-an-id")).syllabi).toBeNull();
    expect((await eraseAccountData("not-an-id")).syllabi).toBe(0);
  });
});
