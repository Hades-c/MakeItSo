import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Instructor } from "@/lib/types/catalog";
import { matchInstructor, type MatchOutcome } from "@/server/rmp/match";
import { RMP_OVERRIDES } from "@/server/rmp/overrides";
import { parseRosterPage, type RosterRow } from "@/server/rmp/roster";
import {
  FIXTURE_TERMS,
  fixtureTeachings,
  homeSubjectsByInstructor,
  homeSubjectsOf,
} from "./helpers";

/**
 * OPT-IN real-roster coverage: the real instructor lists of every course fixture term against a REAL Davidson
 * RateMyProfessors roster capture, with the production override table. The capture is kept outside the repo
 * (fixtures stay synthetic) and this file is skipped unless it is given:
 *
 *   RMP_AUDIT_ROSTER=/path/to/rmp_all_davidson.json npx vitest run tests/rmp/audit-roster.test.ts
 *
 * The capture's shape: { fetchedAt, resultCount, teachers: [<newSearch.teachers node>, ...] }. The run prints
 * counts only, and checks what does not depend on the roster's exact contents: one answer per instructor across
 * sections, the production overrides resolving to the profiles their sources quote, and the known collisions.
 */

const AUDIT_ROSTER = process.env.RMP_AUDIT_ROSTER;

const CaptureSchema = z.object({
  fetchedAt: z.string(),
  resultCount: z.number().int().min(0),
  teachers: z.array(z.unknown()),
});

function loadCapture(file: string): RosterRow[] {
  const capture = CaptureSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  return parseRosterPage({
    data: {
      newSearch: {
        teachers: {
          didFallback: false,
          resultCount: capture.resultCount,
          pageInfo: { hasNextPage: false, endCursor: null },
          edges: capture.teachers.map((node) => ({ node })),
        },
      },
    },
  }).rows;
}

const nameOf = (teacher: RosterRow | null | undefined) =>
  teacher ? `${teacher.firstName} ${teacher.lastName}`.replace(/\s+/g, " ") : null;

describe.skipIf(!AUDIT_ROSTER)("real Davidson roster capture (opt-in: RMP_AUDIT_ROSTER)", () => {
  const roster = AUDIT_ROSTER ? loadCapture(AUDIT_ROSTER) : [];

  function rate(instructor: Instructor, subjects: readonly string[], home: readonly string[]) {
    let result: MatchOutcome<RosterRow> = matchInstructor(instructor, roster, { subjects });
    if (result.needsHomeSubjects) {
      result = matchInstructor(instructor, roster, { subjects, homeSubjects: home });
    }
    return result;
  }

  it("resolves every production override to the profile its source quotes", () => {
    for (const entry of RMP_OVERRIDES) {
      if (!entry.rmp || !("legacyId" in entry.rmp)) continue;
      const target = entry.rmp.legacyId;
      const row = roster.find((teacher) => teacher.legacyId === target);
      expect(row, `${entry.instructor.first} ${entry.instructor.last}`).toBeDefined();
      expect(entry.source).toContain(`"${nameOf(row)}"`);
    }
  });

  it("gives each instructor one answer across sections, and reports coverage per term", () => {
    const lines: string[] = [];
    for (const term of FIXTURE_TERMS) {
      const teachings = fixtureTeachings(term);
      const home = homeSubjectsByInstructor(teachings);
      const outcomes = new Map<string, Set<string>>();
      for (const { instructor, subjects } of teachings) {
        const result = rate(instructor, subjects, homeSubjectsOf(home, instructor));
        const key = `${instructor.first} ${instructor.last}`;
        let set = outcomes.get(key);
        if (!set) outcomes.set(key, (set = new Set()));
        set.add(result.status === "matched" ? `#${result.teacher!.legacyId}` : result.status);
      }
      const inconsistent = [...outcomes].filter(([, set]) => set.size > 1);
      expect(inconsistent, term).toEqual([]);
      const counts = { matched: 0, review: 0, unmatched: 0, staff: 0 };
      for (const set of outcomes.values()) {
        const outcome = [...set][0]!;
        counts[outcome.startsWith("#") ? "matched" : (outcome as keyof typeof counts)]++;
      }
      lines.push(`${term}: ${outcomes.size} instructors, ${JSON.stringify(counts)}`);
    }
    console.log(`[rmp audit roster: ${roster.length} Davidson rows]\n${lines.join("\n")}`);
  });

  it("keeps the known collisions apart", () => {
    const person = (first: string, last: string): Instructor => ({ first, last, isStaff: false });
    const shown = (first: string, last: string, subjects: string[], home: string[] = []) =>
      nameOf(rate(person(first, last), subjects, home).teacher);
    // Christopher Alexander (CHE) is never RMP's Chris Alexander (Political Science), in any section.
    for (const subjects of [["CHE"], ["WRI"], ["HUM"], ["INEU"], ["DAT"], ["SIL"]]) {
      expect(shown("Christopher", "Alexander", subjects, ["CHE"])).toBeNull();
      expect(shown("Christopher", "Alexander", subjects)).toBeNull();
    }
    // Catch-all RMP departments never conflict; one person gets one profile in every course.
    expect(shown("Brad", "Johnson", ["ENV"])).toBe("Bradley Johnson");
    for (const subjects of [["FMS", "COM", "FMD", "GSS"], ["GER"]]) {
      expect(shown("Maggie", "McCarthy", subjects)).toBe("Margaret McCarthy");
    }
    expect(shown("Shyam", "Gouri Suresh", ["SOU"])).toBe("Suresh Gouri");
    expect(shown("Zebulon", "Gouri Suresh", ["ECO"])).toBeNull();
  });
});
