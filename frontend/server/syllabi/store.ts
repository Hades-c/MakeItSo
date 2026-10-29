import "server-only";
import {
  ExtractedDeadlineSchema,
  SyllabusSchema,
  type ExtractedDeadline,
  type Syllabus,
} from "@/lib/types/syllabus";

/**
 * The `syllabi` collection (models/Syllabus.ts) as the Syllabus type (lib/types/syllabus.ts): document ↔ type
 * mapping, mirroring server/plan/store.ts's pattern.
 */

/** Syllabi kept per student (generous: one per course they could ever take, plus some room to spare). */
export const MAX_SYLLABI = 60;

type Raw = Record<string, unknown>;

function hex(value: unknown): string {
  return value && typeof value === "object" && "toHexString" in value
    ? (value as { toHexString(): string }).toHexString()
    : String(value ?? "");
}

function iso(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/** "YYYY-MM-DD" from a stored Date, or null when it is not a valid date. */
function dateOnly(value: unknown): string | null {
  const isoValue = iso(value);
  return isoValue ? isoValue.slice(0, 10) : null;
}

function extractedDeadlineFromDoc(raw: Raw): ExtractedDeadline | null {
  const parsed = ExtractedDeadlineSchema.safeParse({
    title: raw.title,
    dueAt: dateOnly(raw.dueAt),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The stored document as a Syllabus. `planDeadlineCount` is how many plan deadlines trace back to it (counted by the
 * caller from the plan). A document from the earlier file-upload version has `uploadedAt` instead of `addedAt`.
 */
export function syllabusFromDoc(raw: Raw, planDeadlineCount = 0): Syllabus | null {
  const id = hex(raw._id);
  const parsed = SyllabusSchema.safeParse({
    id,
    courseCode: raw.courseCode,
    termCode: raw.termCode,
    addedAt: iso(raw.addedAt ?? raw.uploadedAt),
    planDeadlineCount,
    extractedDeadlines: Array.isArray(raw.extractedDeadlines)
      ? (raw.extractedDeadlines as Raw[]).flatMap((d) => extractedDeadlineFromDoc(d) ?? [])
      : [],
  });
  if (!parsed.success) {
    console.error(`[syllabi] stored syllabus ${id} is invalid and was left out:`, parsed.error);
    return null;
  }
  return parsed.data;
}

export function sortSyllabi(syllabi: Syllabus[]): Syllabus[] {
  return syllabi.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id));
}
