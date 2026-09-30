import "server-only";
import { compareTerms, isTermCode, termFromDateET, termLabel, type TermCode } from "@/lib/term";
import { WAYS_OF_KNOWING, type ReqCode } from "@/lib/types/catalog";
import {
  REQUIREMENT_SLOTS,
  type PlanItem,
  type PlanProgress,
  type PlanStatus,
  type PlanView,
  type PlanWarning,
  type RequirementSlot,
  type SlotStatus,
} from "@/lib/types/plan";
import {
  catalogYearForTerm,
  REQUIREMENTS_DISCLAIMER,
  resolveGraduationRules,
  type GraduationRules,
} from "@/server/content/requirements";
import { firstYearLastTerm } from "@/server/plan/terms";

/**
 * The requirements engine (PLAN §5 "Credits & requirements"): pure, keyed by catalog year, every rule read from
 * server/content/requirements.ts (the Academic Regulations for the student's year of matriculation). Unofficial:
 * every output carries REQUIREMENTS_DISCLAIMER ("Unofficial — verify in Degree Works").
 *
 * Which items count: statuses planned / registered / in-progress / completed ("active"). failed (F, Fail),
 * dropped and withdrawn (W) never count. A slot's status is that of the item filling it: completed → done,
 * in-progress or registered → this-term, planned → planned; nothing → open.
 *
 * (a) Credits: creditsDone = credits of completed items (P counts: a completed P/F item is a pass); 0-credit
 *     sections count 0; creditsPlanned adds in-progress, registered and planned items. At most
 *     `preMatriculation.maxCredits` (4) credits from before matriculation count.
 * (b) Writing (COMP): a COMP-tagged course that is not AP/transfer credit. Warned about until it is done or
 *     planned within the first year, and after that until it is done.
 * (c) Ways of Knowing: seven slots; each course fills at most one (`maxSlotsPerCourse`); at most two
 *     pre-matriculation credits (AP/transfer before the first term, or without a term). Assigned by a maximum
 *     matching (min-cost max-flow): the most slots filled, then the most filled by completed work, then by work in
 *     progress; ties go to courses with the fewest alternative tags (so flexible courses stay free), then term,
 *     code and id order. Tags a course has but does not use are listed in `alsoTagged`.
 * (d) CULT and JEC: one course each; either may be a WoK course too. One course never fills both (the regulation
 *     reads "a WoK requirement and the CULT or the JEC requirement": the conservative reading).
 * (e) Language (FRLG): an FRLG-tagged course (not from the self-instructional program) or the manual
 *     proficiency/exemption toggle.
 * (f) PE: the manual checklist (2 Lifetime Activity + 1 Team Sport): done or open.
 * (g) Pass/Fail: warns above 3 elected courses in total or more than 1 in a term (transfer credit is never P/F).
 * Codes: NONE fills nothing; null reqCodes = "no requirement data" (warned); NSCI = legacy, warned "verify".
 * 0-credit courses fill no slot.
 */

export interface RequirementsInput {
  items: readonly PlanItem[];
  manual: PlanView["manual"];
  /** First term at Davidson: picks the catalog year and marks pre-matriculation credit. */
  firstTerm: TermCode;
  now: Date;
  /** The current term (resolveTerms().current); default: termFromDateET(now). */
  currentTerm?: TermCode;
}

export interface RequirementsReport extends PlanProgress {
  disclaimer: typeof REQUIREMENTS_DISCLAIMER;
  /** The catalog year whose rules were applied. */
  catalogYear: string;
  /** False when the student's catalog year has no verified edition and the nearest one was used. */
  rulesExact: boolean;
  /** Per item id: Ways of Knowing tags the item carries but does not fill. */
  alsoTagged: Record<string, RequirementSlot[]>;
}

const ACTIVE: ReadonlySet<PlanStatus> = new Set([
  "planned",
  "registered",
  "in-progress",
  "completed",
]);

const STATUS_COST: Readonly<Record<string, number>> = {
  completed: 0,
  "in-progress": 1,
  registered: 1,
  planned: 2,
};

const SLOT_STATUS_RANK: Readonly<Record<SlotStatus, number>> = {
  done: 0,
  "this-term": 1,
  planned: 2,
  open: 3,
};

export function slotStatusOf(status: PlanStatus): SlotStatus {
  if (status === "completed") return "done";
  if (status === "in-progress" || status === "registered") return "this-term";
  if (status === "planned") return "planned";
  return "open";
}

export function isActiveItem(item: Pick<PlanItem, "status">): boolean {
  return ACTIVE.has(item.status);
}

/** AP or transfer credit from before the first term (or without a term). */
export function isPreMatriculation(
  item: Pick<PlanItem, "source" | "termCode">,
  firstTerm: TermCode,
): boolean {
  if (item.source !== "ap" && item.source !== "transfer") return false;
  return item.termCode === null || compareTerms(item.termCode, firstTerm) < 0;
}

function hasCode(item: PlanItem, code: ReqCode): boolean {
  return item.reqCodes?.includes(code) ?? false;
}

/** Deterministic order: term (no term first), course code, id. */
function compareItems(a: PlanItem, b: PlanItem): number {
  if (a.termCode !== b.termCode) {
    if (a.termCode === null) return -1;
    if (b.termCode === null) return 1;
    return compareTerms(a.termCode, b.termCode);
  }
  return a.courseCode.localeCompare(b.courseCode) || a.id.localeCompare(b.id);
}

/** Best single item for a slot: best status, then earliest term, code, id. */
function bestItem(items: readonly PlanItem[]): PlanItem | null {
  const sorted = [...items].sort(
    (a, b) =>
      SLOT_STATUS_RANK[slotStatusOf(a.status)] - SLOT_STATUS_RANK[slotStatusOf(b.status)] ||
      compareItems(a, b),
  );
  return sorted[0] ?? null;
}

// ---- Min-cost max-flow (small, deterministic) -------------------------------------------------------------------

interface FlowEdge {
  to: number;
  rev: number;
  cap: number;
  cost: number;
}

class MinCostFlow {
  readonly graph: FlowEdge[][];

  constructor(nodes: number) {
    this.graph = Array.from({ length: nodes }, () => []);
  }

  /** Adds an edge and returns its index in graph[from]. */
  addEdge(from: number, to: number, cap: number, cost: number): number {
    const forward: FlowEdge = { to, rev: this.graph[to]!.length, cap, cost };
    const backward: FlowEdge = { to: from, rev: this.graph[from]!.length, cap: 0, cost: -cost };
    this.graph[from]!.push(forward);
    this.graph[to]!.push(backward);
    return this.graph[from]!.length - 1;
  }

  /** Successive shortest paths (Bellman-Ford); strict improvements only, so ties keep insertion order. */
  run(source: number, sink: number): void {
    const n = this.graph.length;
    for (;;) {
      const dist = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
      const prev = new Array<[number, number] | null>(n).fill(null);
      dist[source] = 0;
      for (let round = 0; round < n; round += 1) {
        let changed = false;
        for (let u = 0; u < n; u += 1) {
          const du = dist[u]!;
          if (du === Number.POSITIVE_INFINITY) continue;
          this.graph[u]!.forEach((edge, index) => {
            if (edge.cap > 0 && du + edge.cost < dist[edge.to]!) {
              dist[edge.to] = du + edge.cost;
              prev[edge.to] = [u, index];
              changed = true;
            }
          });
        }
        if (!changed) break;
      }
      if (dist[sink] === Number.POSITIVE_INFINITY) return;
      for (let v = sink; v !== source;) {
        const [u, index] = prev[v]!;
        const edge = this.graph[u]![index]!;
        edge.cap -= 1;
        this.graph[v]![edge.rev]!.cap += 1;
        v = u;
      }
    }
  }
}

interface WokAssignment {
  /** slot → item */
  filled: Map<RequirementSlot, PlanItem>;
  alsoTagged: Record<string, RequirementSlot[]>;
}

function wokTags(item: PlanItem): RequirementSlot[] {
  return WAYS_OF_KNOWING.filter((code) => hasCode(item, code));
}

function assignWaysOfKnowing(
  items: readonly PlanItem[],
  rules: GraduationRules,
  firstTerm: TermCode,
): WokAssignment {
  const units = items
    .filter((item) => item.credits > 0 && wokTags(item).length > 0)
    .sort(
      (a, b) =>
        (STATUS_COST[a.status] ?? 9) - (STATUS_COST[b.status] ?? 9) ||
        wokTags(a).length - wokTags(b).length ||
        compareItems(a, b),
    );
  const slots = rules.waysOfKnowing.slots.map((slot) => slot.code);
  // Nodes: 0 source, 1 pre-matriculation group, 2 sink, then units, then slots.
  const SOURCE = 0;
  const GROUP = 1;
  const SINK = 2;
  const unitNode = (i: number) => 3 + i;
  const slotNode = (i: number) => 3 + units.length + i;
  const flow = new MinCostFlow(3 + units.length + slots.length);
  flow.addEdge(SOURCE, GROUP, rules.waysOfKnowing.preMatriculationMaxCredits, 0);
  const slotEdges: { unit: number; slot: number; edge: number }[] = [];
  units.forEach((item, i) => {
    const tags = wokTags(item);
    const cost = (STATUS_COST[item.status] ?? 9) * 100 + (tags.length - 1);
    const from = isPreMatriculation(item, firstTerm) ? GROUP : SOURCE;
    flow.addEdge(from, unitNode(i), rules.waysOfKnowing.maxSlotsPerCourse, cost);
    slots.forEach((slot, s) => {
      if (tags.includes(slot)) {
        slotEdges.push({ unit: i, slot: s, edge: flow.addEdge(unitNode(i), slotNode(s), 1, 0) });
      }
    });
  });
  slots.forEach((_slot, s) => flow.addEdge(slotNode(s), SINK, 1, 0));
  flow.run(SOURCE, SINK);

  const filled = new Map<RequirementSlot, PlanItem>();
  const used = new Map<string, RequirementSlot[]>();
  for (const { unit, slot, edge } of slotEdges) {
    if (flow.graph[unitNode(unit)]![edge]!.cap === 0) {
      const item = units[unit]!;
      const code = slots[slot]!;
      filled.set(code, item);
      used.set(item.id, [...(used.get(item.id) ?? []), code]);
    }
  }
  const alsoTagged: Record<string, RequirementSlot[]> = {};
  for (const item of units) {
    const rest = wokTags(item).filter((tag) => !(used.get(item.id) ?? []).includes(tag));
    if (rest.length > 0) alsoTagged[item.id] = rest;
  }
  return { filled, alsoTagged };
}

/** CULT and JEC: the pair (distinct courses) that fills the most, then with the best statuses, then first. */
function assignCultJec(items: readonly PlanItem[]): { CULT?: PlanItem; JEC?: PlanItem } {
  const eligible = items.filter((item) => item.credits > 0);
  const byRank = (list: PlanItem[]) =>
    list.sort(
      (a, b) =>
        SLOT_STATUS_RANK[slotStatusOf(a.status)] - SLOT_STATUS_RANK[slotStatusOf(b.status)] ||
        compareItems(a, b),
    );
  const cult: (PlanItem | undefined)[] = [
    ...byRank(eligible.filter((i) => hasCode(i, "CULT"))),
    undefined,
  ];
  const jec: (PlanItem | undefined)[] = [
    ...byRank(eligible.filter((i) => hasCode(i, "JEC"))),
    undefined,
  ];
  const rank = (item: PlanItem | undefined) =>
    item ? SLOT_STATUS_RANK[slotStatusOf(item.status)] : SLOT_STATUS_RANK.open;
  let best: { CULT?: PlanItem; JEC?: PlanItem } = {};
  let bestScore: [number, number] = [0, Number.POSITIVE_INFINITY];
  for (const c of cult) {
    for (const j of jec) {
      if (c && j && c.id === j.id) continue;
      const count = (c ? 1 : 0) + (j ? 1 : 0);
      const cost = rank(c) + rank(j);
      if (count > bestScore[0] || (count === bestScore[0] && cost < bestScore[1])) {
        best = { ...(c ? { CULT: c } : {}), ...(j ? { JEC: j } : {}) };
        bestScore = [count, cost];
      }
    }
  }
  return best;
}

function sumCredits(items: readonly PlanItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.credits, 0) * 100) / 100;
}

/** The degree progress for a plan (see the module comment). */
export function evaluateRequirements(input: RequirementsInput): RequirementsReport {
  const catalogYear = catalogYearForTerm(input.firstTerm);
  const { rules, exact } = resolveGraduationRules(catalogYear);
  const firstTerm = input.firstTerm;
  const active = input.items.filter(isActiveItem);
  const warnings: PlanWarning[] = [];

  // (a) credits
  const preMat = (item: PlanItem) => isPreMatriculation(item, firstTerm);
  const cap = rules.preMatriculation.maxCredits;
  const done = active.filter((item) => item.status === "completed");
  const preMatDone = sumCredits(done.filter(preMat));
  const preMatAll = sumCredits(active.filter(preMat));
  const creditsDone = sumCredits(done.filter((i) => !preMat(i))) + Math.min(preMatDone, cap);
  const creditsPlanned = sumCredits(active.filter((i) => !preMat(i))) + Math.min(preMatAll, cap);

  const reqs = Object.fromEntries(REQUIREMENT_SLOTS.map((slot) => [slot, "open"])) as Record<
    RequirementSlot,
    SlotStatus
  >;
  const filledBy: Partial<Record<RequirementSlot, string[]>> = {};
  const fill = (slot: RequirementSlot, item: PlanItem | null | undefined) => {
    if (!item) return;
    reqs[slot] = slotStatusOf(item.status);
    filledBy[slot] = [item.id];
  };

  // (b) writing
  const writing = active.filter(
    (item) =>
      item.credits > 0 &&
      hasCode(item, rules.writing.code) &&
      (rules.writing.preMatriculationCounts ||
        (item.source !== "ap" && item.source !== "transfer")),
  );
  fill("COMP", bestItem(writing));

  // (c) Ways of Knowing
  const wok = assignWaysOfKnowing(active, rules, firstTerm);
  for (const [slot, item] of wok.filled) fill(slot, item);

  // (d) CULT and JEC
  const cultJec = assignCultJec(active);
  fill("CULT", cultJec.CULT);
  fill("JEC", cultJec.JEC);

  // (e) language
  if (input.manual.languageExempt) {
    reqs.FRLG = "done";
  } else {
    const excluded = new Set(rules.language.excludedSubjects.map((entry) => entry.subject));
    fill(
      "FRLG",
      bestItem(
        active.filter(
          (item) =>
            item.credits > 0 &&
            hasCode(item, "FRLG") &&
            !excluded.has(item.courseCode.split(" ")[0] ?? ""),
        ),
      ),
    );
  }

  // (f) PE
  const pe = input.manual.pe;
  if (
    pe.lifetimeActivities >= rules.physicalEducation.lifetimeActivity &&
    (pe.teamSport ? 1 : 0) >= rules.physicalEducation.teamSport
  ) {
    reqs.PE = "done";
  }

  // Warnings, in a fixed order.
  const currentTerm =
    input.currentTerm && isTermCode(input.currentTerm)
      ? input.currentTerm
      : termFromDateET(input.now);
  const lastFirstYearTerm = firstYearLastTerm(firstTerm);
  if (reqs.COMP !== "done") {
    const inFirstYear = writing.some(
      (item) => item.termCode !== null && compareTerms(item.termCode, lastFirstYearTerm) <= 0,
    );
    const firstYearOver = compareTerms(currentTerm, lastFirstYearTerm) > 0;
    const courses = rules.writing.courses.join(" or ");
    if (firstYearOver) {
      // Late but under way this term: nothing more to ask.
      if (reqs.COMP !== "this-term")
        warnings.push({
          code: "writing-not-done-first-year",
          message: `The writing requirement (${courses}) was due by the end of your first year (${termLabel(lastFirstYearTerm)}). Complete it as soon as you can.`,
        });
    } else if (!inFirstYear) {
      warnings.push({
        code: "writing-not-done-first-year",
        message: `Complete the writing requirement (${courses}) by the end of your first year (${termLabel(lastFirstYearTerm)}).`,
      });
    }
  }

  const elected = input.items.filter(
    (item) =>
      item.passFail &&
      (ACTIVE.has(item.status) || item.status === "failed") &&
      item.source !== "transfer" &&
      item.source !== "ap",
  );
  if (elected.length > rules.passFail.maxElected) {
    warnings.push({
      code: "pass-fail-total",
      message: `${elected.length} courses are Pass/Fail; at most ${rules.passFail.maxElected} may be elected Pass/Fail.`,
    });
  }
  const perTerm = new Map<TermCode, number>();
  for (const item of elected) {
    if (item.termCode) perTerm.set(item.termCode, (perTerm.get(item.termCode) ?? 0) + 1);
  }
  for (const [termCode, count] of [...perTerm].sort((a, b) => compareTerms(a[0], b[0]))) {
    if (count > rules.passFail.maxPerSemester) {
      warnings.push({
        code: "pass-fail-term",
        message: `${count} Pass/Fail courses in ${termLabel(termCode)}; at most ${rules.passFail.maxPerSemester} per semester.`,
        termCode,
      });
    }
  }

  const sortedActive = [...active].sort(compareItems);
  for (const item of sortedActive) {
    if (hasCode(item, "NSCI")) {
      warnings.push({
        code: "nsci-verify",
        message: `${item.courseCode} carries the legacy NSCI tag: verify in Degree Works whether it counts for Natural Science.`,
        itemId: item.id,
        ...(item.termCode ? { termCode: item.termCode } : {}),
      });
    }
  }
  for (const item of sortedActive) {
    if (item.reqCodes === null && !item.unverified && item.credits > 0) {
      warnings.push({
        code: "no-requirement-data",
        message: `No requirement data for ${item.courseCode}${item.termCode ? ` in ${termLabel(item.termCode)}` : ""}.`,
        itemId: item.id,
        ...(item.termCode ? { termCode: item.termCode } : {}),
      });
    }
  }
  for (const item of sortedActive) {
    if (item.unverified) {
      warnings.push({
        code: "unverified-course",
        message: `${item.courseCode} is not in the Davidson course data: its title, credits and requirements are unverified.`,
        itemId: item.id,
        ...(item.termCode ? { termCode: item.termCode } : {}),
      });
    }
  }

  const external = active.filter((item) => item.source === "ap" || item.source === "transfer");
  if (external.length > 0) {
    const residence = rules.credits.required * rules.credits.residenceFraction;
    const externalCredits = sumCredits(external);
    const parts = [
      `At least ${residence} of the ${rules.credits.required} courses must be taken in residence at Davidson, including the final ${rules.credits.residenceFinalCourses}.`,
    ];
    if (preMatAll > cap) {
      parts.push(
        `Only ${cap} credits from before matriculation count; your plan lists ${preMatAll}.`,
      );
    }
    if (externalCredits > rules.credits.required - residence) {
      parts.push(`Your plan lists ${externalCredits} credits from AP or transfer.`);
    }
    warnings.push({ code: "residence-note", message: parts.join(" ") });
  }

  return {
    creditsDone,
    creditsPlanned,
    required: rules.credits.required,
    reqs,
    filledBy,
    warnings,
    disclaimer: REQUIREMENTS_DISCLAIMER,
    catalogYear: rules.catalogYear,
    rulesExact: exact,
    alsoTagged: wok.alsoTagged,
  };
}

/** True when a COMP-tagged, non-AP/transfer course is completed (the "COMP met" test for W sections). */
export function isCompMet(items: readonly PlanItem[], beforeTerm?: TermCode | null): boolean {
  return items.some(
    (item) =>
      item.credits > 0 &&
      hasCode(item, "COMP") &&
      item.source !== "ap" &&
      item.source !== "transfer" &&
      (item.status === "completed" ||
        ((item.status === "in-progress" || item.status === "registered") &&
          !!beforeTerm &&
          item.termCode !== null &&
          compareTerms(item.termCode, beforeTerm) < 0)),
  );
}
