import "server-only";
import * as z from "zod";
import type { AiResult } from "@/lib/types/ai";
import { CourseCodeSchema, TermCodeSchema } from "@/lib/types/common";
import type { Syllabus } from "@/lib/types/syllabus";
import SyllabusModel from "@/models/Syllabus";
import { registerAccountData } from "@/server/account/erasers";
import { okResult } from "@/server/ai/features/common";
import { extractSyllabusDeadlines } from "@/server/ai/features/syllabus-deadlines";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { removeDeadlinesBySyllabus } from "@/server/plan";
import { userObjectId } from "@/server/plan/context";
import { parseOr400 } from "@/server/plan/items";
import { MAX_SYLLABI, sortSyllabi, syllabusFromDoc } from "@/server/syllabi/store";

/**
 * Syllabus uploads (/syllabi, PLAN-UX §3): the metadata and extracted deadlines of each upload, one document per
 * (student, course, term) in the `syllabi` collection (models/Syllabus.ts). The file itself never reaches here
 * (server/syllabi/extract.ts reads it in the route handler and discards it); this module only extracts the
 * deadlines (through the AI feature, behind its own consent gate) and stores the result.
 */

const UploadInputSchema = z
  .object({
    courseCode: CourseCodeSchema,
    termCode: TermCodeSchema,
    filename: z.string().trim().min(1).max(200),
    syllabusText: z.string().min(1),
  })
  .strict();

export async function listSyllabiImpl(userId: string): Promise<Syllabus[]> {
  const oid = userObjectId(userId);
  await getDb();
  const docs = await SyllabusModel.find({ userId: oid }).lean();
  return sortSyllabi(docs.flatMap((doc) => syllabusFromDoc(doc) ?? []));
}

/**
 * Extract deadlines from a syllabus's text and store the upload, replacing any earlier upload for the same
 * course and term. A replace first removes that earlier upload's own plan deadlines (their due dates traced
 * back to syllabus content this upload has just overwritten); the fresh deadlines below are not added to the
 * plan automatically — that is the separate, later review-and-save step (server/plan addSyllabusDeadlines).
 * Returns the AI outcome: on anything but `kind: "ok"` nothing is written, so a quota or consent failure leaves
 * the student's uploads untouched.
 */
export async function uploadSyllabusImpl(
  userId: string,
  input: { courseCode: string; termCode: string; filename: string; syllabusText: string },
): Promise<AiResult<{ syllabus: Syllabus }>> {
  const body = parseOr400(UploadInputSchema, input);
  const oid = userObjectId(userId);
  await getDb();
  const extraction = await extractSyllabusDeadlines(userId, {
    courseCode: body.courseCode,
    termCode: body.termCode,
    syllabusText: body.syllabusText,
  });
  if (extraction.kind !== "ok") return extraction;

  const existing = await SyllabusModel.findOne({
    userId: oid,
    courseCode: body.courseCode,
    termCode: body.termCode,
  })
    .select("_id")
    .lean();
  if (existing) {
    await removeDeadlinesBySyllabus(userId, String(existing._id));
  } else if ((await SyllabusModel.countDocuments({ userId: oid })) >= MAX_SYLLABI) {
    throw new ApiError(409, "conflict", `You can keep at most ${MAX_SYLLABI} syllabus uploads.`);
  }

  const doc = await SyllabusModel.findOneAndUpdate(
    { userId: oid, courseCode: body.courseCode, termCode: body.termCode },
    {
      $set: {
        filename: body.filename,
        uploadedAt: now(),
        extractedDeadlines: extraction.data.deadlines.map((d) => ({
          title: d.title,
          dueAt: new Date(`${d.dueAt}T00:00:00.000Z`),
        })),
      },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
  const syllabus = doc ? syllabusFromDoc(doc) : null;
  if (!syllabus) throw new Error(`[syllabi] just-saved upload for ${userId} did not read back`);
  return okResult(
    { syllabus },
    {
      servedModel: extraction.servedModel,
      fallbackUsed: extraction.fallbackUsed,
      cached: extraction.cached,
    },
  );
}

/** This syllabus upload, when it exists and belongs to the student (so a deadline cannot be tagged with
 * someone else's syllabus id, or one that no longer exists); null otherwise. */
export async function getSyllabusImpl(
  userId: string,
  syllabusId: string,
): Promise<Syllabus | null> {
  const oid = userObjectId(userId);
  if (!/^[a-f0-9]{24}$/.test(syllabusId)) return null;
  await getDb();
  const doc = await SyllabusModel.findOne({ userId: oid, _id: syllabusId }).lean();
  return doc ? syllabusFromDoc(doc) : null;
}

/** Delete a syllabus upload and every plan deadline that traces back to it. A missing id is a no-op. */
export async function deleteSyllabusImpl(userId: string, syllabusId: string): Promise<void> {
  const oid = userObjectId(userId);
  if (!/^[a-f0-9]{24}$/.test(syllabusId)) return;
  await getDb();
  const deleted = await SyllabusModel.findOneAndDelete({ userId: oid, _id: syllabusId }).select(
    "_id",
  );
  if (!deleted) return;
  await removeDeadlinesBySyllabus(userId, syllabusId);
}

// ---- Account data (PLAN §4.1.12): "Download my data" and "Delete account" ---------------------------------------

registerAccountData("syllabi", {
  async export(userId) {
    if (!/^[a-f0-9]{24}$/.test(userId)) return null;
    await getDb();
    return SyllabusModel.find({ userId }).lean();
  },
  async erase(userId) {
    if (!/^[a-f0-9]{24}$/.test(userId)) return 0;
    await getDb();
    return (await SyllabusModel.deleteMany({ userId })).deletedCount;
  },
});
