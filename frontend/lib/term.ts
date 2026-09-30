/**
 * Davidson term codes (PLAN §5): YYYY01 = Fall YYYY, YYYY02 = Spring YYYY+1.
 * e.g. 202601 → Fall 2026, 202602 → Spring 2027.
 * Resolving the active/next term from the Davidson API belongs to the catalog service (server/catalog).
 */

export type Season = "Fall" | "Spring";

export interface Term {
  code: string;
  season: Season;
  /** Calendar year the term takes place in. */
  year: number;
  label: string;
}

const TERM_CODE = /^(\d{4})(01|02)$/;

export function isTermCode(value: string): boolean {
  return TERM_CODE.test(value);
}

/** Parse a term code; null when it is not a valid Fall/Spring code. */
export function parseTermCode(code: string): Term | null {
  const match = TERM_CODE.exec(code);
  if (!match?.[1] || !match[2]) return null;
  const academicYear = Number(match[1]);
  const season: Season = match[2] === "01" ? "Fall" : "Spring";
  const year = season === "Fall" ? academicYear : academicYear + 1;
  return { code, season, year, label: `${season} ${year}` };
}

/** "Spring 2027" for "202602"; the code itself when it cannot be parsed. */
export function termLabel(code: string): string {
  return parseTermCode(code)?.label ?? code;
}
