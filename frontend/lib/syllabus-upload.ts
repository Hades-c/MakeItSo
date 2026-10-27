/**
 * Syllabus upload limits shared by the client (the upload form's own check, before sending) and the server
 * (server/syllabi/extract.ts, the authoritative check). Isomorphic: no zod, safe in client bundles.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The `accept` attribute for the file input. */
export const ACCEPTED_FILE_EXTENSIONS = ".pdf,.docx";

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
