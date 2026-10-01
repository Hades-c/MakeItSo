import * as z from "zod";
import { apiRoute } from "@/lib/api/spec";
import {
  AcademicProgramSchema,
  AcademicProgramSummarySchema,
  ProgramOfferingKindSchema,
  ProgramSyncResultSchema,
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
  /**
   * GET /api/cron/programs (weekly Vercel Cron, `Authorization: Bearer $CRON_SECRET`): refresh the program list
   * and the pages Acalog reports as changed. 200 with `ok: false` when Acalog failed; the last good copy is kept.
   */
  cron: apiRoute({
    method: "GET",
    path: "/api/cron/programs",
    auth: "cron",
    response: ProgramSyncResultSchema,
  }),
} as const;
