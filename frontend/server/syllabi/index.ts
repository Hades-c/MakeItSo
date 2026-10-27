import "server-only";
import type { AiResult } from "@/lib/types/ai";
import type { Syllabus } from "@/lib/types/syllabus";
import {
  deleteSyllabusImpl,
  getSyllabusImpl,
  listSyllabiImpl,
  uploadSyllabusImpl,
} from "@/server/syllabi/records";

/**
 * Syllabus uploads (/syllabi, PLAN-UX §3). Import from "@/server/syllabi".
 *
 *   listSyllabi(userId)                          every upload, newest first
 *   uploadSyllabus(userId, input)                extract + store, replacing any upload for the same course/term
 *   deleteSyllabus(userId, syllabusId)            remove the upload and its plan deadlines
 *   getSyllabus(userId, syllabusId)                it, when it exists and belongs to this student
 *
 * The file a student uploads is read once (server/syllabi/extract.ts, called by the route handler) and never
 * stored; what persists is in models/Syllabus.ts. Registers the "syllabi" account data (server/account/erasers.ts
 * ACCOUNT_DATA_MODULES) as a side effect of importing server/syllabi/records.ts.
 */

export async function listSyllabi(userId: string): Promise<Syllabus[]> {
  return listSyllabiImpl(userId);
}

export async function uploadSyllabus(
  userId: string,
  input: { courseCode: string; termCode: string; filename: string; syllabusText: string },
): Promise<AiResult<{ syllabus: Syllabus }>> {
  return uploadSyllabusImpl(userId, input);
}

export async function deleteSyllabus(userId: string, syllabusId: string): Promise<void> {
  return deleteSyllabusImpl(userId, syllabusId);
}

export async function getSyllabus(userId: string, syllabusId: string): Promise<Syllabus | null> {
  return getSyllabusImpl(userId, syllabusId);
}
