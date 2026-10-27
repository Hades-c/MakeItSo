import { syllabiApi } from "@/lib/api/syllabi";
import { aiGateFailure } from "@/lib/types/ai";
import { AI_ROUTE_RATE_LIMIT, aiGateInput } from "@/server/ai";
import { defineRoute } from "@/server/http";
import { ApiError } from "@/server/http/errors";
import { fileKind, extractSyllabusText, MAX_UPLOAD_BYTES } from "@/server/syllabi/extract";
import { listSyllabi, uploadSyllabus } from "@/server/syllabi";

// GET /api/syllabi → { syllabi } (newest upload first).
export const GET = defineRoute(syllabiApi.list, async ({ user }) => ({
  syllabi: await listSyllabi(user.id),
}));

/**
 * POST /api/syllabi → AiResult<{ syllabus }>. multipart/form-data: `file` (PDF/.docx, ≤10MB), `courseCode`,
 * `termCode`. No `body` schema (defineRoute only parses JSON bodies): the fields are read from `request.formData()`
 * and checked by hand, same shape as the other AI routes' gate-then-generate handlers.
 */
export const maxDuration = 120;

export const POST = defineRoute(
  { ...syllabiApi.upload, rateLimit: AI_ROUTE_RATE_LIMIT },
  async ({ request, user }) => {
    const gate = aiGateFailure(await aiGateInput(user.id, "syllabus-deadlines"));
    if (gate) return gate;

    const form = await request.formData().catch(() => {
      throw new ApiError(400, "bad_request", "Send the upload as multipart/form-data.");
    });
    const file = form.get("file");
    const courseCode = form.get("courseCode");
    const termCode = form.get("termCode");
    if (!(file instanceof File)) {
      throw new ApiError(400, "validation_failed", "Choose a file to upload.");
    }
    if (typeof courseCode !== "string" || typeof termCode !== "string") {
      throw new ApiError(400, "validation_failed", "Choose a course and a term.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(
        400,
        "validation_failed",
        `That file is larger than ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      );
    }
    const kind = fileKind(file.type, file.name);
    if (!kind) {
      throw new ApiError(400, "validation_failed", "Upload a PDF or a Word (.docx) file.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const syllabusText = await extractSyllabusText(buffer, kind);
    return uploadSyllabus(user.id, { courseCode, termCode, filename: file.name, syllabusText });
  },
);
