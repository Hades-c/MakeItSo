/**
 * Programs a student can declare that have no Acalog offering of their own, so they are not among the official
 * program names (server/programs). Each is sourced to the catalog page that describes it (catalog 28, 2026-2027,
 * the one server/programs/catalog-info.ts pins; tests/programs/unlisted-programs.test.ts checks the links).
 *
 * The onboarding and profile pickers list them after the official names, and the profile stores them like an
 * official name (server/auth/profile.ts profileProgramNames). Nothing else treats them as programs: AI payloads
 * keep official names only, and there are no requirements or program page for them. The owner chose this over a
 * note-only picker (2026-10-22).
 */

export interface UnlistedProgram {
  kind: "major" | "minor";
  /** What the picker shows and the profile stores. */
  name: string;
  /** The picker's note on how the program works. */
  note: string;
  /** The Acalog page that describes it. */
  sourceUrl: string;
  sourceLabel: string;
}

export const UNLISTED_PROGRAMS: readonly UnlistedProgram[] = [
  {
    kind: "major",
    name: "Student-designed major (Center for Interdisciplinary Studies)",
    // The CIS page (checked 2026-10-22): its interdisciplinary majors are "not offered by an academic department or
    // program"; sophomores apply, and there is no guarantee.
    note: "A major through the Center for Interdisciplinary Studies is applied for and approved there, so the catalog lists no major of its own.",
    // Acalog program "Center for Interdisciplinary Studies" (legacy id 1794).
    sourceUrl: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1794",
    sourceLabel: "Center for Interdisciplinary Studies in the catalog",
  },
  {
    kind: "minor",
    name: "Interdisciplinary Minor in Middle East Studies",
    note: "The interdisciplinary minor in Middle East Studies has no catalog page of its own; the Arab Studies page mentions it.",
    // Acalog program "Arab Studies" (legacy id 1791): "Students should note as well the possibility of a focus on the
    // Middle East through an interdisciplinary minor in Middle East Studies" (checked 2026-10-22).
    sourceUrl: "https://catalog.davidson.edu/preview_program.php?catoid=28&poid=1791",
    sourceLabel: "Arab Studies in the catalog",
  },
];

/** The unlisted programs of one kind, in list order. */
export function unlistedPrograms(kind: UnlistedProgram["kind"]): UnlistedProgram[] {
  return UNLISTED_PROGRAMS.filter((program) => program.kind === kind);
}

/** The unlisted program with this exact name, if it is one. */
export function unlistedProgram(name: string): UnlistedProgram | undefined {
  return UNLISTED_PROGRAMS.find((program) => program.name === name);
}
