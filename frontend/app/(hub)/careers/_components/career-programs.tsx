import Link from "next/link";
import { SectionCard } from "@/components/ui/section-card";
import { SourceTag } from "@/components/ui/source-tag";
import { routes } from "@/lib/routes";
import type { Career } from "@/lib/types/content";
import { ACALOG_CATALOG } from "@/server/programs/catalog-info";
import { loadRelatedPrograms, type RelatedProgramView } from "../_lib/programs";
import { ExternalLink } from "./external-link";

/**
 * Related departments (links into the catalog, filtered by department) and official programs: the Acalog names
 * with their catalog pages (tag COURSE CATALOG). Presentational part first (tested), loader below.
 */

/**
 * Where the program names come from, said truthfully: the catalog only when every name is the catalog's (a
 * program falls back to the career guide's own name when the catalog cannot be read or does not list it).
 */
export function programsNote(programs: readonly RelatedProgramView[], catalogYear: string): string {
  const year = catalogYear.replace("-", "–");
  const official = programs.filter((program) => program.official).length;
  if (official === programs.length) {
    return `Official names from the ${year} Davidson catalog, where the requirements are.`;
  }
  if (official === 0) {
    return `Program names from the career guide; see the ${year} Davidson catalog for the official names and requirements.`;
  }
  return `Tagged names are official, from the ${year} Davidson catalog; the others are from the career guide.`;
}

export function ProgramsList({
  departments,
  programs,
  catalogYear,
}: {
  departments: Career["departments"];
  programs: readonly RelatedProgramView[];
  /** "2026-2027". */
  catalogYear: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {departments.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-fg">Departments</h3>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {departments.map((department) => (
              <li key={department.code}>
                <Link
                  href={routes.courses({ dept: [department.code] })}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm text-fg hover:bg-surface-2 md:min-h-8"
                >
                  <span className="font-mono text-xs font-semibold">{department.code}</span>{" "}
                  {department.name}
                  <span className="sr-only">: browse courses</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {programs.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-fg">Majors and minors</h3>
          <ul className="mt-1.5 flex flex-col gap-2">
            {programs.map((program) => (
              <li
                key={program.name}
                className="flex flex-wrap items-center gap-x-2 gap-y-1"
                data-aggregated={program.official ? "catalog" : undefined}
                data-source={program.official ? "catalog" : undefined}
              >
                {program.url ? (
                  <ExternalLink href={program.url} className="text-sm">
                    {program.name}
                  </ExternalLink>
                ) : (
                  <span className="text-sm font-semibold text-fg">{program.name}</span>
                )}
                {program.official ? <SourceTag source="catalog" /> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-fg-3" data-testid="programs-note">
            {programsNote(programs, catalogYear)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export async function CareerPrograms({ career }: { career: Career }) {
  const programs = await loadRelatedPrograms(career);
  return (
    <SectionCard id="programs" title="Departments and programs">
      <ProgramsList
        departments={career.departments}
        programs={programs}
        catalogYear={ACALOG_CATALOG.year}
      />
    </SectionCard>
  );
}
