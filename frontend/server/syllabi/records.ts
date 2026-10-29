import "server-only";
import * as z from "zod";
import type { AiResult } from "@/lib/types/ai";
import { CourseCodeSchema, TermCodeSchema } from "@/lib/types/common";
import { termLabel } from "@/lib/term";
import type { Syllabus } from "@/lib/types/syllabus";
import SyllabusModel from "@/models/Syllabus";
import { registerAccountData } from "@/server/account/erasers";
import { okResult } from "@/server/ai/features/common";
import { extractSyllabusDeadlines } from "@/server/ai/features/syllabus-deadlines";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { listDeadlines, removeDeadlinesBySyllabus } from "@/server/plan";
import { userObjectId } from "@/server/plan/context";
import { parseOr400 } from "@/server/plan/items";
import { MAX_SYLLABI, sortSyllabi, syllabusFromDoc } from "@/server/syllabi/store";
import { syllabusTerms } from "@/server/syllabi/terms";

/**
 * Pasted syllabi (/syllabi, PLAN-UX §3): the course, term and extracted deadlines of each syllabus, one document
 * per (student, course, term) in the `syllabi` collection (models/Syllabus.ts). The pasted text is only passed
 * through: it goes to the AI extraction (behind its own consent gate, fenced as untrusted) and is never stored or
 * logged; this module stores the result.
 */

const AddInputSchema = z
  .object({
    courseCode: CourseCodeSchema,
    termCode: TermCodeSchema,
    text: z.string().min(1),
  })
  .strict();

/** How many plan deadlines trace back to each syllabus id. */
async function planCounts(userId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const deadline of await listDeadlines(userId)) {
    if (deadline.syllabusId) {
      counts.set(deadline.syllabusId, (counts.get(deadline.syllabusId) ?? 0) + 1);
    }
  }
  return counts;
}

export async function listSyllabiImpl(userId: string): Promise<Syllabus[]> {
  const oid = userObjectId(userId);
  await getDb();
  const [docs, counts] = await Promise.all([
    SyllabusModel.find({ userId: oid }).lean(),
    planCounts(userId),
  ]);
  return sortSyllabi(
    docs.flatMap((doc) => syllabusFromDoc(doc, counts.get(String(doc._id)) ?? 0) ?? []),
  );
}

/** How many syllabi the student has (Today's pointer to /syllabi). */
export async function countSyllabiImpl(userId: string): Promise<number> {
  const oid = userObjectId(userId);
  await getDb();
  return SyllabusModel.countDocuments({ userId: oid });
}

/**
 * Extract deadlines from a syllabus's pasted text and store the result, replacing any earlier syllabus for the
 * same course and term. The term must be the current or the next one (syllabusTerms). A replace first removes that
 * earlier syllabus's own plan deadlines (their due dates traced back to syllabus content this one has just
 * overwritten); the fresh deadlines below are not added to the plan automatically — that is the separate, later
 * review-and-save step (server/plan addSyllabusDeadlines). Returns the AI outcome: on anything but `kind: "ok"`
 * nothing is written, so a quota or consent failure leaves the student's syllabi untouched.
 */
export async function addSyllabusImpl(
  userId: string,
  input: { courseCode: string; termCode: string; text: string },
): Promise<AiResult<{ syllabus: Syllabus }>> {
  const body = parseOr400(AddInputSchema, input);
  const oid = userObjectId(userId);
  const terms = await syllabusTerms();
  if (!terms.some((term) => term.code === body.termCode)) {
    throw new ApiError(
      400,
      "validation_failed",
      `Add a syllabus for ${terms.map((term) => term.label).join(" or ")}, not ${termLabel(body.termCode)}.`,
    );
  }
  await getDb();
  const extraction = await extractSyllabusDeadlines(userId, {
    courseCode: body.courseCode,
    termCode: body.termCode,
    syllabusText: body.text,
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
    throw new ApiError(409, "conflict", `You can keep at most ${MAX_SYLLABI} syllabi.`);
  }

  const doc = await SyllabusModel.findOneAndUpdate(
    { userId: oid, courseCode: body.courseCode, termCode: body.termCode },
    {
      $set: {
        addedAt: now(),
        extractedDeadlines: extraction.data.deadlines.map((d) => ({
          title: d.title,
          dueAt: new Date(`${d.dueAt}T00:00:00.000Z`),
        })),
      },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();
  const syllabus = doc ? syllabusFromDoc(doc) : null;
  if (!syllabus) throw new Error(`[syllabi] just-saved syllabus for ${userId} did not read back`);
  return okResult(
    { syllabus },
    {
      servedModel: extraction.servedModel,
      fallbackUsed: extraction.fallbackUsed,
      cached: extraction.cached,
    },
  );
}

/** This syllabus, when it exists and belongs to the student (so a deadline cannot be tagged with someone else's
 * syllabus id, or one that no longer exists); null otherwise. */
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

/** Delete a syllabus and every plan deadline that traces back to it. A missing id is a no-op. */
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
