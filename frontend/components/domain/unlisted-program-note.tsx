import { unlistedPrograms, type UnlistedProgram } from "@/lib/unlisted-programs";

/**
 * Under a majors or minors picker: the choices it lists that have no catalog offering of their own (a CIS major,
 * the Middle East Studies minor; lib/unlisted-programs.ts), how each works and the catalog page that describes it.
 * One sentence per program, its link inline; it sits inside the picker's fieldset.
 */
export function UnlistedProgramNote({ kind }: { kind: UnlistedProgram["kind"] }) {
  const programs = unlistedPrograms(kind);
  if (programs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 text-xs text-fg-3" data-testid={`unlisted-${kind}`}>
      {programs.map((program) => (
        <p key={program.name}>
          <span className="font-semibold text-fg-2">{program.name}:</span> {program.note} See{" "}
          <a
            href={program.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold link"
          >
            {program.sourceLabel}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          .
        </p>
      ))}
    </div>
  );
}
