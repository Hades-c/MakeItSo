import type { CareerSummer, Office, Program, ProgramSource } from "@/lib/types/content";
import { officeShortName } from "@/server/content/offices";

/**
 * A career's "Summers" entries as the card shows them (PLAN §3 /careers/[slug]; owner request 2026-10-29). An
 * office program is resolved to the curated record (server/content/offices.ts): its own name, page, audience,
 * deadlines as published, source and verifiedAt; only the one-line description is the career's. An outside program
 * keeps its own fields. Pure: the programs and offices come in as arguments.
 */

export interface SummerView {
  key: string;
  name: string;
  url: string;
  description: string;
  /** Who it is for, as the source states it; null when the source does not say. */
  audience: string | null;
  /** Deadlines (an office program's deadline text) or timing (an outside program's), as published. */
  timing: { label: "Deadlines" | "Timing"; text: string } | null;
  /** The curated source id of an office program; null for an outside program (no source id covers it). */
  source: ProgramSource | null;
  /** The office's name beside a DAVIDSON OFFICES source (officeShortName); null otherwise. */
  officeName: string | null;
  /** Who runs an outside program ("National Science Foundation"); null for an office program. */
  by: string | null;
  verifiedAt: string;
}

export function resolveSummers(
  entries: readonly CareerSummer[] | undefined,
  programs: readonly Program[],
  offices: readonly Office[],
): SummerView[] {
  const bySlug = new Map(programs.map((program) => [program.slug, program]));
  const officeBySlug = new Map(offices.map((office) => [office.slug, office]));
  return (entries ?? []).flatMap((entry): SummerView[] => {
    if (entry.kind === "outside") {
      return [
        {
          key: `outside:${entry.url}`,
          name: entry.name,
          url: entry.url,
          description: entry.description,
          audience: entry.eligibility,
          timing: entry.timing ? { label: "Timing", text: entry.timing } : null,
          source: null,
          officeName: null,
          by: entry.by,
          verifiedAt: entry.verifiedAt,
        },
      ];
    }
    const program = bySlug.get(entry.program);
    // server/content/careers.ts refuses an unknown slug at load; a stale one here renders nothing, never a guess.
    if (!program) return [];
    const office = officeBySlug.get(program.officeSlug);
    return [
      {
        key: `program:${program.slug}`,
        name: program.name,
        url: program.url,
        description: entry.description,
        audience: program.audience,
        timing: program.deadlineText ? { label: "Deadlines", text: program.deadlineText } : null,
        source: program.source,
        officeName:
          program.source === "davidson-offices" && office ? officeShortName(office) : null,
        by: null,
        verifiedAt: program.verifiedAt,
      },
    ];
  });
}

/** The earliest and latest `verifiedAt` of a list ("YYYY-MM-DD" compares as text); null when it is empty. */
export function verifiedRange(
  items: readonly { verifiedAt: string }[],
): { from: string; to: string } | null {
  if (items.length === 0) return null;
  const days = items.map((item) => item.verifiedAt).sort();
  return { from: days[0]!, to: days[days.length - 1]! };
}
