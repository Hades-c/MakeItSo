import { z } from "zod";
import { apiRoute } from "@/lib/api/spec";
import {
  AcademicProgramSchema,
  AcademicProgramSummarySchema,
  ProgramOfferingKindSchema,
} from "@/lib/types/catalog";
import { queryList } from "@/lib/types/common";

/**
 * Academic programs from Acalog (W1b: app/api/programs/**). Official major/minor names for onboarding, the profile
 * and the AI enums. Public and CDN-cached.
 */

export const ProgramsQuerySchema = z.object({ kind: queryList(ProgramOfferingKindSchema) });

export const ProgramsResponseSchema = z.object({
  catalogYear: z.string(),
  programs: z.array(AcademicProgramSummarySchema),
});

export const ProgramResponseSchema = z.object({ program: AcademicProgramSchema });

export const programsApi = {
  /** GET /api/programs?kind=major → every program with its official offering names. */
  list: apiRoute({
    method: "GET",
    path: "/api/programs",
    auth: "public",
    cache: "public-catalog",
    query: ProgramsQuerySchema,
    response: ProgramsResponseSchema,
  }),
  /** GET /api/programs/172 → one program with requirement text. */
  get: apiRoute({
    method: "GET",
    path: "/api/programs/[id]",
    auth: "public",
    cache: "public-catalog",
    params: z.object({ id: z.coerce.number().int().positive() }),
    response: ProgramResponseSchema,
  }),
} as const;
