import type { WebTreeChoice, WebTreeList } from "@/lib/types/plan";

/**
 * Pure edits of a ranked WebTree list (PLAN §5 "WebTree list"): the Next semester tab applies one of these, shows
 * the result at once and saves the whole list (PUT /api/plan/webtree). Every edit keeps the list valid for the
 * server's structural checks: ranks are 1..n in order, every CRN appears once (as a choice or as an alternate),
 * at most MAX_CHOICES choices and MAX_ALTERNATES alternates per choice. An edit that cannot apply returns
 * `{ ok: false, reason }` with a sentence for the student, and the list is left as it was.
 */

export const MAX_CHOICES = 20;
export const MAX_ALTERNATES = 10;

export type EditResult = { ok: true; list: WebTreeList } | { ok: false; reason: string };

/** Choices sorted by rank, renumbered 1..n. */
export function normalizeRanks(choices: readonly WebTreeChoice[]): WebTreeChoice[] {
  return [...choices]
    .sort((a, b) => a.rank - b.rank)
    .map((choice, index) => ({ ...choice, rank: index + 1, alternates: [...choice.alternates] }));
}

function withChoices(list: WebTreeList, choices: readonly WebTreeChoice[]): EditResult {
  return { ok: true, list: { termCode: list.termCode, choices: normalizeRanks(choices) } };
}

/** Every CRN in the list (choices and alternates). */
export function listedCrns(list: WebTreeList): Set<string> {
  return new Set(list.choices.flatMap((choice) => [choice.crn, ...choice.alternates]));
}

/** Where a CRN sits: "choice" of rank n, an "alternate" of rank n, or null. */
export function findCrn(
  list: WebTreeList,
  crn: string,
): { role: "choice" | "alternate"; rank: number } | null {
  for (const choice of normalizeRanks(list.choices)) {
    if (choice.crn === crn) return { role: "choice", rank: choice.rank };
    if (choice.alternates.includes(crn)) return { role: "alternate", rank: choice.rank };
  }
  return null;
}

function alreadyListed(list: WebTreeList, crn: string): string | null {
  const at = findCrn(list, crn);
  if (!at) return null;
  return at.role === "choice"
    ? `CRN ${crn} is already your choice ${at.rank}.`
    : `CRN ${crn} is already an alternate for choice ${at.rank}.`;
}

/** Move the choice at `rank` up (towards 1) or down by one place. */
export function moveChoice(list: WebTreeList, rank: number, direction: "up" | "down"): EditResult {
  const choices = normalizeRanks(list.choices);
  const index = choices.findIndex((choice) => choice.rank === rank);
  if (index < 0) return { ok: false, reason: `There is no choice ${rank}.` };
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0) return { ok: false, reason: "That choice is already first." };
  if (target >= choices.length) return { ok: false, reason: "That choice is already last." };
  const [moved] = choices.splice(index, 1);
  choices.splice(target, 0, moved!);
  return withChoices(
    list,
    choices.map((choice, i) => ({ ...choice, rank: i + 1 })),
  );
}

/** Append a new choice (last rank). */
export function addChoice(
  list: WebTreeList,
  section: { crn: string; courseCode: string },
): EditResult {
  const listed = alreadyListed(list, section.crn);
  if (listed) return { ok: false, reason: listed };
  if (list.choices.length >= MAX_CHOICES) {
    return { ok: false, reason: `A WebTree list holds at most ${MAX_CHOICES} choices.` };
  }
  const choices = normalizeRanks(list.choices);
  choices.push({
    rank: choices.length + 1,
    crn: section.crn,
    courseCode: section.courseCode,
    alternates: [],
  });
  return withChoices(list, choices);
}

/** Remove the choice at `rank` (its alternates go with it); later choices move up. */
export function removeChoice(list: WebTreeList, rank: number): EditResult {
  const choices = normalizeRanks(list.choices);
  if (!choices.some((choice) => choice.rank === rank)) {
    return { ok: false, reason: `There is no choice ${rank}.` };
  }
  return withChoices(
    list,
    choices.filter((choice) => choice.rank !== rank),
  );
}

/** Add an alternate section to the choice at `rank`. */
export function addAlternate(list: WebTreeList, rank: number, crn: string): EditResult {
  const listed = alreadyListed(list, crn);
  if (listed) return { ok: false, reason: listed };
  const choices = normalizeRanks(list.choices);
  const choice = choices.find((candidate) => candidate.rank === rank);
  if (!choice) return { ok: false, reason: `There is no choice ${rank}.` };
  if (choice.alternates.length >= MAX_ALTERNATES) {
    return {
      ok: false,
      reason: `A choice holds at most ${MAX_ALTERNATES} alternates.`,
    };
  }
  choice.alternates.push(crn);
  return withChoices(list, choices);
}

/** Remove one alternate. */
export function removeAlternate(list: WebTreeList, rank: number, crn: string): EditResult {
  const choices = normalizeRanks(list.choices);
  const choice = choices.find((candidate) => candidate.rank === rank);
  if (!choice || !choice.alternates.includes(crn)) {
    return { ok: false, reason: `CRN ${crn} is not an alternate for choice ${rank}.` };
  }
  choice.alternates = choice.alternates.filter((alternate) => alternate !== crn);
  return withChoices(list, choices);
}

/**
 * Make an alternate the choice at its rank: the old choice takes the alternate's place (same position in the
 * alternates), so nothing is lost. `courseCode` is the alternate section's own listing code (an alternate may be
 * another course).
 */
export function promoteAlternate(
  list: WebTreeList,
  rank: number,
  crn: string,
  courseCode: string,
): EditResult {
  const choices = normalizeRanks(list.choices);
  const choice = choices.find((candidate) => candidate.rank === rank);
  if (!choice || !choice.alternates.includes(crn)) {
    return { ok: false, reason: `CRN ${crn} is not an alternate for choice ${rank}.` };
  }
  const previous = choice.crn;
  choice.alternates = choice.alternates.map((alternate) =>
    alternate === crn ? previous : alternate,
  );
  choice.crn = crn;
  choice.courseCode = courseCode;
  return withChoices(list, choices);
}

/** True when two lists are the same ranked list (same order, same CRNs, same alternates). */
export function sameList(a: WebTreeList, b: WebTreeList): boolean {
  if (a.termCode !== b.termCode) return false;
  const x = normalizeRanks(a.choices);
  const y = normalizeRanks(b.choices);
  return (
    x.length === y.length &&
    x.every(
      (choice, i) =>
        choice.crn === y[i]!.crn &&
        choice.courseCode === y[i]!.courseCode &&
        choice.alternates.length === y[i]!.alternates.length &&
        choice.alternates.every((crn, j) => crn === y[i]!.alternates[j]),
    )
  );
}
