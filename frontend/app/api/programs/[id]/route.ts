import { programsApi } from "@/lib/api/programs";
import { ApiError, defineRoute } from "@/server/http";
import { getProgram } from "@/server/programs";
import { ACALOG_CATALOG } from "@/server/programs/catalog-info";

// GET /api/programs/172 → { program } with requirement text (contract: lib/api/programs.ts). Public and
// CDN-cached; 404 for an id the catalog does not list, 503 (with Retry-After) while a never-read page cannot be
// fetched. Only the canonical spelling of an id is served ("172", not "0172" or "1.72e2"), so each program has one
// CDN cache entry and variants cannot be used to reach Acalog again.
function rawSegment(request: Request): string {
  try {
    return decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  } catch {
    return ""; // malformed percent-encoding: never canonical
  }
}

export const GET = defineRoute(programsApi.get, async ({ request, params }) => {
  if (rawSegment(request) !== String(params.id)) {
    throw new ApiError(
      400,
      "bad_request",
      `Use the program's id as a plain number, e.g. /api/programs/${params.id}.`,
    );
  }
  const program = await getProgram(params.id);
  if (!program) {
    throw new ApiError(
      404,
      "not_found",
      `The ${ACALOG_CATALOG.year} catalog has no program with id ${params.id}.`,
    );
  }
  return { program };
});
