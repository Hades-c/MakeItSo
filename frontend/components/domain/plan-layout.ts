/**
 * Pure layout for the degree map: credit slots per term, credit totals, and the per-year grouping used on
 * phones. Term codes follow PLAN §4.1: YYYY01 = Fall YYYY, YYYY02 = Spring YYYY+1, YYYY03 = Summer YYYY+1.
 */

export type PlanSlotStatus = "done" | "in-progress" | "planned" | "open";

export interface PlanMapSlot {
  status: PlanSlotStatus;
  /** Course code, e.g. "CSC 221". Omit for an open slot. */
  code?: string;
  /** Course credits: 1 fills one slot, 2 (HUM 103, GRE 103) fills two, 0 (ensembles, MIL labs) fills none. */
  credits: number;
  /**
   * false: a repeat of a course the plan already counts (credit is received only once for a course, so the plan
   * service counts it once). It is still drawn, but left out of the totals, so they match the service's.
   */
  counts?: boolean;
}

export interface PlanMapTerm {
  termCode: string;
  /** Full label, e.g. "Fall 2025" (used for screen readers and on phones). */
  label: string;
  slots: readonly PlanMapSlot[];
  /** The term in progress now ("F26 · now"). */
  isCurrent?: boolean;
}

export interface PlanCell {
  status: PlanSlotStatus;
  code?: string;
  /** Slots this cell covers (2 for a 2-credit course). */
  span: number;
  credits: number;
}

export interface TermLayout {
  term: PlanMapTerm;
  short: string;
  season: "fall" | "spring" | "summer" | "unknown";
  cells: PlanCell[];
  /** Courses that carry no credit: listed under the map, not slotted. */
  unslotted: PlanMapSlot[];
  openSlots: number;
}

export interface PlanTotals {
  done: number;
  inProgress: number;
  planned: number;
  required: number;
  /** done + in progress: the headline number ("12 of 32 credits"). */
  earnedOrEarning: number;
}

/** Season and short label for a term code: "202501" → fall / "F25", "202602" → spring / "S27", "202503" → "Su26". */
export function termShortLabel(termCode: string): { season: TermLayout["season"]; short: string } {
  const match = /^(\d{4})(0[1-3])$/.exec(termCode);
  if (!match?.[1] || !match[2]) return { season: "unknown", short: termCode };
  const year = Number(match[1]);
  const yy = (y: number) => String(y % 100).padStart(2, "0");
  if (match[2] === "01") return { season: "fall", short: `F${yy(year)}` };
  if (match[2] === "02") return { season: "spring", short: `S${yy(year + 1)}` };
  return { season: "summer", short: `Su${yy(year + 1)}` };
}

/** Academic year of a term code: "202501", "202502", "202503" → "2025–26". */
export function academicYearLabel(termCode: string): string {
  const year = Number(termCode.slice(0, 4));
  return Number.isFinite(year) ? `${year}–${String((year + 1) % 100).padStart(2, "0")}` : termCode;
}

/** Slots a course fills: 0 for a 0-credit course, otherwise its credits rounded up (at least 1). */
export function slotSpan(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0;
  return Math.max(1, Math.ceil(credits));
}

/**
 * Cells for one term: courses in the order given, an explicit open slot as one cell, then open cells to pad the
 * term to `slotsPerTerm` (default 4, a full Davidson load). A term with more courses simply grows.
 */
export function layoutTerm(term: PlanMapTerm, slotsPerTerm = 4): TermLayout {
  const cells: PlanCell[] = [];
  const unslotted: PlanMapSlot[] = [];
  for (const slot of term.slots) {
    if (slot.status === "open") {
      cells.push({ status: "open", span: 1, credits: 0 });
      continue;
    }
    const span = slotSpan(slot.credits);
    if (span === 0) {
      unslotted.push(slot);
      continue;
    }
    cells.push({ status: slot.status, code: slot.code, span, credits: slot.credits });
  }
  const used = cells.reduce((n, c) => n + c.span, 0);
  for (let i = used; i < slotsPerTerm; i++) cells.push({ status: "open", span: 1, credits: 0 });
  const { season, short } = termShortLabel(term.termCode);
  return {
    term,
    short,
    season,
    cells,
    unslotted,
    openSlots: cells.filter((c) => c.status === "open").length,
  };
}

/** Credit totals across the plan (0-credit items and open slots count 0). */
export function planTotals(terms: readonly PlanMapTerm[], requiredCredits: number): PlanTotals {
  const totals = { done: 0, inProgress: 0, planned: 0 };
  for (const term of terms) {
    for (const slot of term.slots) {
      if (slot.counts === false) continue;
      const credits = Number.isFinite(slot.credits) ? Math.max(0, slot.credits) : 0;
      if (slot.status === "done") totals.done += credits;
      else if (slot.status === "in-progress") totals.inProgress += credits;
      else if (slot.status === "planned") totals.planned += credits;
    }
  }
  return {
    ...totals,
    required: requiredCredits,
    earnedOrEarning: totals.done + totals.inProgress,
  };
}

/** Share of the requirement, 0–1, for a progress-bar segment. */
export function share(credits: number, required: number): number {
  if (required <= 0) return 0;
  return Math.min(1, Math.max(0, credits / required));
}

export interface YearRow {
  label: string;
  /** Fall, Spring and Summer columns in that order; null where the plan has no such term. */
  fall: TermLayout | null;
  spring: TermLayout | null;
  summer: TermLayout | null;
}

/** Terms grouped into academic years for the phone layout (one row per year). */
export function groupByYear(layouts: readonly TermLayout[]): YearRow[] {
  const rows = new Map<string, YearRow>();
  for (const layout of layouts) {
    const key = layout.term.termCode.slice(0, 4);
    const row = rows.get(key) ?? {
      label: academicYearLabel(layout.term.termCode),
      fall: null,
      spring: null,
      summer: null,
    };
    if (layout.season === "fall") row.fall = layout;
    else if (layout.season === "spring") row.spring = layout;
    else if (layout.season === "summer") row.summer = layout;
    rows.set(key, row);
  }
  return [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
}
