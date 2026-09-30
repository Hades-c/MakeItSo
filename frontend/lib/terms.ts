// Term helpers shared by server and client code (no server-only imports).
//
// Davidson term codes: <academic-year start><01|02|03>, e.g. 202601 = Fall
// 2026, 202602 = Spring 2027, 202603 = Summer 2027.

export type Season = "Fall" | "Spring" | "Summer";

export interface TermInfo {
  code: string; // e.g. "202602"
  label: string; // e.g. "Spring 2027"
  season: Season;
  year: number; // calendar year of the term, e.g. 2027
}

export interface ResolvedTerms {
  /** The term in session now (Davidson API is_active). */
  active: TermInfo;
  /** The term students register for next: first non-summer term after `active`. */
  registration: TermInfo;
  /** "live" = from the terms API, "stale" = last good copy, "fallback" = computed from the date. */
  source: "live" | "stale" | "fallback";
}

const SEASON_SUFFIX: Record<Season, string> = { Fall: "01", Spring: "02", Summer: "03" };

export function parseTermLabel(label: string): { season: Season; year: number } | null {
  const m = /^(Fall|Spring|Summer) (\d{4})$/.exec(label.trim());
  if (!m) return null;
  return { season: m[1] as Season, year: Number(m[2]) };
}

/** Plan entries store semester + calendar year; convert to a Davidson term code. */
export function termCodeFor(season: Season, year: number): string {
  const academicStart = season === "Fall" ? year : year - 1;
  return `${academicStart}${SEASON_SUFFIX[season]}`;
}

export function termFromCode(code: string): TermInfo | null {
  const m = /^(\d{4})(01|02|03)$/.exec(code);
  if (!m) return null;
  const start = Number(m[1]);
  const season: Season = m[2] === "01" ? "Fall" : m[2] === "02" ? "Spring" : "Summer";
  const year = season === "Fall" ? start : start + 1;
  return { code, label: `${season} ${year}`, season, year };
}

/**
 * Used only when the Davidson terms API has never answered: Aug-Dec = Fall is
 * active and the following Spring is next; Jan-May = Spring is active and the
 * following Fall is next; Jun-Jul = Summer is active and Fall is next.
 */
export function fallbackTerms(now: Date = new Date()): ResolvedTerms {
  const y = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  let active: TermInfo;
  let registration: TermInfo;
  if (month >= 7) {
    active = termFromCode(`${y}01`)!;
    registration = termFromCode(`${y}02`)!;
  } else if (month <= 4) {
    active = termFromCode(`${y - 1}02`)!;
    registration = termFromCode(`${y}01`)!;
  } else {
    active = termFromCode(`${y - 1}03`)!;
    registration = termFromCode(`${y}01`)!;
  }
  return { active, registration, source: "fallback" };
}

/**
 * Options for "Add to Plan" term pickers: every Fall/Spring/Summer from three
 * academic years before the active term to three years after the
 * registration term, in chronological order.
 */
export function planTermOptions(terms: ResolvedTerms): TermInfo[] {
  const first = Number(terms.active.code.slice(0, 4)) - 3;
  const last = Number(terms.registration.code.slice(0, 4)) + 3;
  const out: TermInfo[] = [];
  for (let start = first; start <= last; start++) {
    for (const suffix of ["01", "02", "03"]) {
      const t = termFromCode(`${start}${suffix}`);
      if (t) out.push(t);
    }
  }
  return out;
}
