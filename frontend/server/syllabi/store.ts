import "server-only";
import {
  ExtractedDeadlineSchema,
  SyllabusSchema,
  type ExtractedDeadline,
  type Syllabus,
} from "@/lib/types/syllabus";
import type { SyllabusDocument } from "@/models/Syllabus";

/**
 * The `syllabi` collection (models/Syllabus.ts) as the Syllabus type (lib/types/syllabus.ts): document ↔ type
 * mapping, mirroring server/plan/store.ts's pattern.
 */

/** Syllabus uploads kept per student (generous: one per course they could ever take, plus some room to spare). */
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

export function syllabusFromDoc(raw: Raw): Syllabus | null {
  const id = hex(raw._id);
  const parsed = SyllabusSchema.safeParse({
    id,
    courseCode: raw.courseCode,
    termCode: raw.termCode,
    filename: raw.filename,
    uploadedAt: iso(raw.uploadedAt),
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

export function syllabusFromDocument(doc: SyllabusDocument): Syllabus | null {
  return syllabusFromDoc(doc.toObject());
}

export function sortSyllabi(syllabi: Syllabus[]): Syllabus[] {
  return syllabi.sort(
    (a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.id.localeCompare(b.id),
  );
}
