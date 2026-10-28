import "server-only";
import type { AiResult } from "@/lib/types/ai";
import type { Syllabus } from "@/lib/types/syllabus";
import {
  addSyllabusImpl,
  countSyllabiImpl,
  deleteSyllabusImpl,
  getSyllabusImpl,
  listSyllabiImpl,
} from "@/server/syllabi/records";

export { syllabusTerms, type SyllabusTerm } from "@/server/syllabi/terms";

/**
 * Pasted syllabi (/syllabi, PLAN-UX §3). Import from "@/server/syllabi".
 *
 *   listSyllabi(userId)                          every syllabus, newest first, with its plan-deadline count
 *   countSyllabi(userId)                         how many (Today's pointer to /syllabi)
 *   addSyllabus(userId, input)                   extract + store, replacing any syllabus for the same course/term
 *   deleteSyllabus(userId, syllabusId)            remove the syllabus and its plan deadlines
 *   getSyllabus(userId, syllabusId)                it, when it exists and belongs to this student
 *   syllabusTerms()                              the terms a syllabus can be for: current (default) and next
 *
 * The text a student pastes is passed to the AI extraction once and never stored or logged; what persists is in
 * models/Syllabus.ts. Registers the "syllabi" account data (server/account/erasers.ts ACCOUNT_DATA_MODULES) as a
 * side effect of importing server/syllabi/records.ts.
 */

export async function listSyllabi(userId: string): Promise<Syllabus[]> {
  return listSyllabiImpl(userId);
}

export async function countSyllabi(userId: string): Promise<number> {
  return countSyllabiImpl(userId);
}

export async function addSyllabus(
  userId: string,
  input: { courseCode: string; termCode: string; text: string },
): Promise<AiResult<{ syllabus: Syllabus }>> {
  return addSyllabusImpl(userId, input);
}

export async function deleteSyllabus(userId: string, syllabusId: string): Promise<void> {
  return deleteSyllabusImpl(userId, syllabusId);
}

export async function getSyllabus(userId: string, syllabusId: string): Promise<Syllabus | null> {
  return getSyllabusImpl(userId, syllabusId);
}
