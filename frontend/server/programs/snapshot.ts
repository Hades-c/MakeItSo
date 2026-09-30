import "server-only";
import { z } from "zod";
import { ProgramOfferingKindSchema } from "@/lib/types/catalog";
import { IsoDateSchema } from "@/lib/types/common";
import { ACALOG_CATALOG } from "@/server/programs/catalog-info";
import { parseProgramDetail } from "@/server/programs/parse";
import snapshotData from "@/server/programs/snapshot.json";
import {
  type AcalogProgramDetail,
  type AcalogProgramListItem,
  isPublicProgram,
} from "@/server/programs/upstream";

/**
 * The checked-in program list (server/programs/snapshot.json): every public program of the 2026-2027 catalog with
 * its official offering names, kinds and degrees, so onboarding, the profile and the AI enums work before the first
 * sync and whenever the database has no synced list (PLAN §6.1 W1b "Seeded from a checked-in snapshot").
 * Requirement text is not in it: program pages load lazily and are cached for 7 days.
 *
 * Built by `buildSnapshot()` from the live list (`/programs?page-size=100`) and every public program page, with the
 * same parser the service uses; tests/programs/snapshot.test.ts checks it against the recorded fixtures. To
 * refresh it, fetch the list and pages (EXTERNAL_MODE=live), call buildSnapshot, write the JSON and run
 * `npm run format`.
 */

export const SnapshotOfferingSchema = z
  .object({
    kind: ProgramOfferingKindSchema,
    name: z.string().min(1),
    degree: z.string().min(1).nullable(),
  })
  .strict();

export const SnapshotProgramSchema = z
  .object({
    acalogId: z.number().int().positive(),
    legacyId: z.number().int().positive().nullable(),
    name: z.string().min(1),
    code: z.string(),
    programTypes: z.array(z.string()),
    /** Acalog's `modified` stamp of the program when the snapshot was taken. */
    modified: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    offerings: z.array(SnapshotOfferingSchema),
  })
  .strict();
export type SnapshotProgram = z.infer<typeof SnapshotProgramSchema>;

export const ProgramSnapshotSchema = z
  .object({
    catalogId: z.literal(ACALOG_CATALOG.id),
    catalogYear: z.literal(ACALOG_CATALOG.year),
    capturedAt: IsoDateSchema,
    source: z.string(),
    programs: z.array(SnapshotProgramSchema).min(1),
  })
  .strict();
export type ProgramSnapshot = z.infer<typeof ProgramSnapshotSchema>;

let cached: ProgramSnapshot | null = null;

/** The checked-in snapshot, validated once. */
export function programSnapshot(): ProgramSnapshot {
  cached ??= ProgramSnapshotSchema.parse(snapshotData);
  return cached;
}

export const SNAPSHOT_SOURCE =
  "https://catalog.davidson.edu/widget-api/catalog/4/programs?page-size=100 and /widget-api/catalog/4/program/{id}";

/**
 * Build the snapshot from a program list and the pages of its public programs (a public program without a page
 * is an error: the snapshot must name every offering).
 */
export function buildSnapshot(
  list: readonly AcalogProgramListItem[],
  pages: ReadonlyMap<number, AcalogProgramDetail>,
  capturedAt: string,
): ProgramSnapshot {
  const publicPrograms = list.filter(isPublicProgram);
  const names = publicPrograms.map((item) => item.name);
  const programs = publicPrograms.map((item): SnapshotProgram => {
    const page = pages.get(item.id);
    if (!page) throw new Error(`buildSnapshot: no program page for ${item.id} (${item.name})`);
    const parsed = parseProgramDetail(page, { otherProgramNames: names });
    return {
      acalogId: item.id,
      legacyId: item["legacy-id"] ?? null,
      name: parsed.name,
      code: parsed.code,
      programTypes: parsed.programTypes,
      modified: item.modified,
      offerings: parsed.offerings.map(({ kind, name, degree }) => ({ kind, name, degree })),
    };
  });
  return ProgramSnapshotSchema.parse({
    catalogId: ACALOG_CATALOG.id,
    catalogYear: ACALOG_CATALOG.year,
    capturedAt,
    source: SNAPSHOT_SOURCE,
    programs,
  });
}
