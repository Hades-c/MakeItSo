import type { RmpOverride } from "@/server/rmp/overrides";

/**
 * The override table the W2 tests use against the SYNTHETIC fixture roster (tests/fixtures/external/
 * ratemyprofessors). The production table (server/rmp/overrides.ts) targets real RMP profile ids, which the
 * fixtures never contain; these entries mirror its rules for the same instructors with the fixture's invented ids.
 */
export const SYNTHETIC_OVERRIDES: readonly RmpOverride[] = [
  {
    instructor: { first: "Lengxob", last: "Yong" },
    rmp: { legacyId: 9000026 },
    note: "test: listed under the English name Lenny (fixture row 9000026)",
    source: "tests/fixtures/external/ratemyprofessors/cases.json",
    verifiedAt: "2026-09-30",
  },
  {
    instructor: { first: "Shyam", last: "Gouri Suresh" },
    rmp: { legacyId: 9000018 },
    note: "test: listed by the two-word surname only, as 'Suresh Gouri' (fixture row 9000018, the primary profile)",
    source: "tests/fixtures/external/ratemyprofessors/cases.json",
    verifiedAt: "2026-09-30",
  },
];
