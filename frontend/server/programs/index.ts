import "server-only";
import type {
  AcademicProgram,
  AcademicProgramSummary,
  ProgramOfferingKind,
} from "@/lib/types/catalog";
import { notImplemented } from "@/server/http/errors";

/**
 * Academic programs service (Acalog; PLAN §6.1 W1b; owner W1b). FROZEN signatures: W1b replaces the bodies; until
 * then every function throws ApiError(501, "unavailable", "... is not implemented yet.").
 *
 * Source: catalog.davidson.edu/widget-api/catalog/4/programs and /program/{id} through fetchExternal("catalog", ...),
 * seeded from a checked-in snapshot, refreshed weekly, stored in `programs` (keeps the last good copy when a
 * refresh is a non-200, a WAF 202, empty/non-JSON, or has fewer than 45 programs).
 */

export interface ProgramFilter {
  kinds?: readonly ProgramOfferingKind[];
}

export async function listPrograms(_filter: ProgramFilter = {}): Promise<AcademicProgramSummary[]> {
  throw notImplemented("listPrograms");
}

/** One program by Acalog id; null when unknown. */
export async function getProgram(_acalogId: number): Promise<AcademicProgram | null> {
  throw notImplemented("getProgram");
}

/**
 * Official offering names of one kind, sorted ("Major in Computer Science (B.S. Degree)"): the enum for
 * onboarding, the profile and the AI career plan.
 */
export async function officialProgramNames(_kind: ProgramOfferingKind): Promise<string[]> {
  throw notImplemented("officialProgramNames");
}

/** Weekly refresh; records the run with recordSync("catalog", ...). */
export async function syncPrograms(): Promise<{ ok: boolean; count: number; error?: string }> {
  throw notImplemented("syncPrograms");
}
