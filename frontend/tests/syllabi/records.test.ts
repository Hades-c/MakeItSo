import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertStudent, withSyllabiDb } from "./helpers";
import Plan from "@/models/Plan";
import SyllabusModel from "@/models/Syllabus";
import {
  accountDataNames,
  eraseAccountData,
  exportAccountData,
  loadAccountDataRegistrations,
} from "@/server/account/erasers";
import { addSyllabusDeadlines, listDeadlines } from "@/server/plan";
import { setMockAiScenario } from "@/server/ai/mock";
import { deleteSyllabus, getSyllabus, listSyllabi, uploadSyllabus } from "@/server/syllabi";
import { MAX_SYLLABI } from "@/server/syllabi/store";

withSyllabiDb();

beforeEach(() => vi.stubEnv("AI_PROVIDER", "mock"));
afterEach(() => vi.unstubAllEnvs());

const SYLLABUS_TEXT = "CSC 221\nMidterm exam on October 15.\nFinal paper due December 3.";

async function upload(userId: string, courseCode = "CSC 221", termCode = "202601") {
  const result = await uploadSyllabus(userId, {
    courseCode,
    termCode,
    filename: "syllabus.pdf",
    syllabusText: SYLLABUS_TEXT,
  });
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
  return result.data.syllabus;
}

describe("uploadSyllabus", () => {
  it("extracts and stores the syllabus's metadata and deadlines, never the file itself", async () => {
    const userId = await insertStudent();
    const syllabus = await upload(userId);
    expect(syllabus).toMatchObject({
      courseCode: "CSC 221",
      termCode: "202601",
      filename: "syllabus.pdf",
    });
    expect(syllabus.extractedDeadlines).toEqual([
      { title: "Midterm Exam", dueAt: "2026-10-15" },
      { title: "Final Paper", dueAt: "2026-12-03" },
    ]);
    const doc = await SyllabusModel.findById(syllabus.id).lean();
    expect(doc).not.toHaveProperty("fileContent");
    expect(doc).not.toHaveProperty("file");
    expect(Object.keys(doc!).sort()).toEqual(
      [
        "__v",
        "_id",
        "courseCode",
        "createdAt",
        "extractedDeadlines",
        "filename",
        "termCode",
        "updatedAt",
        "uploadedAt",
        "userId",
      ].sort(),
    );
  });

  it("writes nothing when the AI call fails (a quota or consent failure leaves uploads untouched)", async () => {
    const userId = await insertStudent();
    setMockAiScenario("timeout", { times: 1 });
    const result = await uploadSyllabus(userId, {
      courseCode: "CSC 221",
      termCode: "202601",
      filename: "syllabus.pdf",
      syllabusText: SYLLABUS_TEXT,
    });
    expect(result.kind).toBe("timeout");
    expect(await listSyllabi(userId)).toEqual([]);
  });

  it("replacing a syllabus for the same course and term keeps its id but drops its plan deadlines", async () => {
    const userId = await insertStudent();
    const first = await upload(userId);
    await addSyllabusDeadlines(userId, first.id, first.extractedDeadlines);
    expect(await listDeadlines(userId)).toHaveLength(2);

    const replaced = await upload(userId);
    expect(replaced.id).toBe(first.id);
    expect(await listSyllabi(userId)).toHaveLength(1);
    // The old syllabus's deadlines are gone from the plan; nothing new was added until review-and-save runs again.
    expect(await listDeadlines(userId)).toEqual([]);
  });

  it("keeps uploads for different students, and for different courses or terms, separate", async () => {
    const a = await insertStudent();
    const b = await insertStudent();
    await upload(a, "CSC 221", "202601");
    await upload(a, "CSC 221", "202602");
    await upload(b, "CSC 221", "202601");
    expect(await listSyllabi(a)).toHaveLength(2);
    expect(await listSyllabi(b)).toHaveLength(1);
  });

  it("enforces MAX_SYLLABI for a genuinely new upload, not a replace", async () => {
    const userId = await insertStudent();
    const oid = new mongoose.Types.ObjectId(userId);
    await SyllabusModel.insertMany(
      Array.from({ length: MAX_SYLLABI }, (_, i) => ({
        userId: oid,
        courseCode: `AAA ${100 + i}`,
        termCode: "202601",
        filename: "x.pdf",
        uploadedAt: new Date(),
        extractedDeadlines: [],
      })),
    );
    await expect(
      uploadSyllabus(userId, {
        courseCode: "ZZZ 999",
        termCode: "202601",
        filename: "syllabus.pdf",
        syllabusText: SYLLABUS_TEXT,
      }),
    ).rejects.toMatchObject({ status: 409 });
    // Replacing one of the existing uploads is still allowed: it is not a new slot.
    const replaced = await upload(userId, "AAA 100", "202601");
    expect(replaced.courseCode).toBe("AAA 100");
  });

  it("rejects an invalid course code or term before calling the AI", async () => {
    const userId = await insertStudent();
    await expect(
      uploadSyllabus(userId, {
        courseCode: "not a code",
        termCode: "202601",
        filename: "syllabus.pdf",
        syllabusText: SYLLABUS_TEXT,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("listSyllabi / getSyllabus / deleteSyllabus", () => {
  it("lists uploads newest first", async () => {
    const userId = await insertStudent();
    await upload(userId, "CSC 221", "202601");
    await upload(userId, "ENG 260", "202601");
    const list = await listSyllabi(userId);
    expect(list.map((s) => s.courseCode)).toEqual(["ENG 260", "CSC 221"]);
  });

  it("getSyllabus only finds an upload that belongs to this student", async () => {
    const owner = await insertStudent();
    const other = await insertStudent();
    const syllabus = await upload(owner);
    expect(await getSyllabus(owner, syllabus.id)).toMatchObject({ id: syllabus.id });
    expect(await getSyllabus(other, syllabus.id)).toBeNull();
    expect(await getSyllabus(owner, "650000000000000000000000")).toBeNull();
  });

  it("deleting a syllabus also removes the plan deadlines that trace back to it, nothing else", async () => {
    const userId = await insertStudent();
    const syllabus = await upload(userId);
    await addSyllabusDeadlines(userId, syllabus.id, syllabus.extractedDeadlines);
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
    const syllabus = await upload(owner);
    await deleteSyllabus(other, syllabus.id);
    expect(await listSyllabi(owner)).toHaveLength(1);
    await expect(deleteSyllabus(owner, "650000000000000000000000")).resolves.toBeUndefined();
  });
});

describe("account data registry", () => {
  it("registers 'syllabi' for export and erase", async () => {
    await loadAccountDataRegistrations();
    expect(accountDataNames()).toContain("syllabi");

    const userId = await insertStudent();
    await upload(userId);
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
