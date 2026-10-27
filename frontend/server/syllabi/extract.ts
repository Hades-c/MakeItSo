import "server-only";
import mammoth from "mammoth";
// Not the package root: its index.js runs a debug self-test at import time (reads a fixture relative to the
// package directory) whenever it thinks it is the entry module, which throws ENOENT here. This subpath is the
// worker it wraps, with no such self-test (types/pdf-parse-lib.d.ts gives it @types/pdf-parse's shape).
import pdf from "pdf-parse/lib/pdf-parse.js";
import { MAX_UPLOAD_BYTES } from "@/lib/syllabus-upload";
import { ApiError } from "@/server/http/errors";

/**
 * Read a syllabus upload into plain text, in memory, once (PLAN-UX §3: the file itself is never stored). PDF
 * and Word (.docx) only, at most MAX_UPLOAD_BYTES (lib/syllabus-upload.ts: shared with the upload form's own
 * check). Scanned PDFs (an image with no text layer) and old .doc files extract to little or nothing; callers
 * treat empty or near-empty text as a clear failure rather than silently reporting "no deadlines found" (see
 * uploadSyllabusImpl).
 */

export { MAX_UPLOAD_BYTES };

export const ACCEPTED_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;
export type AcceptedFileKind = (typeof ACCEPTED_TYPES)[keyof typeof ACCEPTED_TYPES];

/** The kind implied by a file's name (".pdf", ".docx"), for when the browser sends no (or a generic) MIME type. */
function kindFromName(filename: string): AcceptedFileKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

/** The file's kind from its declared type, falling back to its extension; null when neither says PDF or DOCX. */
export function fileKind(contentType: string, filename: string): AcceptedFileKind | null {
  const declared = ACCEPTED_TYPES[contentType as keyof typeof ACCEPTED_TYPES];
  return declared ?? kindFromName(filename);
}

/** At least this many non-space characters, or the file is treated as unreadable (a scanned image, a blank page). */
const MIN_USABLE_CHARS = 40;

export class UnreadableSyllabusError extends ApiError {
  constructor(reason: string) {
    super(
      400,
      "validation_failed",
      `MakeItSo could not read any text from that file (${reason}). A scanned image has no text layer to read; try a text-based PDF or a .docx file, or enter deadlines by hand on /plan.`,
    );
  }
}

/** Extract plain text from a PDF or DOCX buffer. Throws UnreadableSyllabusError when too little text comes out. */
export async function extractSyllabusText(buffer: Buffer, kind: AcceptedFileKind): Promise<string> {
  let text: string;
  try {
    text =
      kind === "pdf" ? (await pdf(buffer)).text : (await mammoth.extractRawText({ buffer })).value;
  } catch (error) {
    throw new UnreadableSyllabusError(
      error instanceof Error ? error.message : "the file could not be parsed",
    );
  }
  if (text.replace(/\s/g, "").length < MIN_USABLE_CHARS) {
    throw new UnreadableSyllabusError("likely a scanned image, or an empty document");
  }
  return text;
}
