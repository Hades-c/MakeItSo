import "server-only";
import { ApiError } from "@/server/http/errors";

/** Default request body limit (PLAN §4.1.9). */
export const DEFAULT_MAX_BODY_BYTES = 16_384;

const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;

/**
 * Read a JSON request body as text with a byte cap, then JSON.parse it.
 *   - Content-Type other than application/json → 415 (bad_request)
 *   - Content-Length or the streamed size above maxBytes → 413 (bad_request)
 *   - empty or malformed JSON → 400 bad_request "Request body must be valid JSON."
 * The caller validates the parsed value with its (strict) zod schema.
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new ApiError(415, "bad_request", "Send the request body as application/json.");
  }
  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(maxBytes);

  const text = await readTextCapped(request, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "bad_request", "Request body must be valid JSON.");
  }
}

function tooLarge(maxBytes: number): ApiError {
  return new ApiError(413, "bad_request", `Request body is larger than ${maxBytes} bytes.`);
}

async function readTextCapped(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
