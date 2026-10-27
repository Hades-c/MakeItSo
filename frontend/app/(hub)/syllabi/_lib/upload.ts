"use client";

import { aiFailureOf, apiErrorOf, ApiClientError } from "@/lib/api/client";
import type { AiResult } from "@/lib/types/ai";
import type { Syllabus } from "@/lib/types/syllabus";

/**
 * POST /api/syllabi as multipart/form-data: callApi only sends JSON, so the upload form calls this instead.
 * Same error handling as callApi (lib/api/client.ts): a non-2xx AiResult failure is returned, not thrown.
 */
export async function uploadSyllabusFile(input: {
  file: File;
  courseCode: string;
  termCode: string;
}): Promise<AiResult<{ syllabus: Syllabus }>> {
  const form = new FormData();
  form.set("file", input.file);
  form.set("courseCode", input.courseCode);
  form.set("termCode", input.termCode);

  let res: Response;
  try {
    res = await fetch("/api/syllabi", {
      method: "POST",
      body: form,
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  } catch {
    throw new ApiClientError(0, "network", "Could not reach MakeItSo. Check your connection.");
  }

  const json: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const failure = aiFailureOf(json);
    if (failure) return failure as AiResult<{ syllabus: Syllabus }>;
    const error = apiErrorOf(json);
    if (error) throw new ApiClientError(res.status, error.code, error.message, error.issues);
    throw new ApiClientError(res.status, "internal", "Something went wrong. Please try again.");
  }
  if (json === undefined) {
    throw new ApiClientError(
      res.status,
      "invalid_response",
      "Unexpected response from the server.",
    );
  }
  return json as AiResult<{ syllabus: Syllabus }>;
}
