import { programsApi } from "@/lib/api/programs";
import { ApiError, defineRoute } from "@/server/http";
import { getProgram } from "@/server/programs";
import { ACALOG_CATALOG } from "@/server/programs/catalog-info";

// GET /api/programs/172 → { program } with requirement text (contract: lib/api/programs.ts). Public and
// CDN-cached; 404 for an id the catalog does not list, 503 while a never-read page cannot be fetched.
export const GET = defineRoute(programsApi.get, async ({ params }) => {
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
