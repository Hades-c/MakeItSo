import type { PlanItemSource, PlanStatus } from "@/lib/types/plan";
import { PLAN_STATUSES } from "@/lib/types/plan";
import type { PlanTab } from "@/lib/routes";

/** Words for every plan value the UI shows (no grades exist anywhere in MakeItSo). Isomorphic. */

export const STATUS_LABELS: Readonly<Record<PlanStatus, string>> = {
  planned: "Planned",
  registered: "Registered",
  "in-progress": "In progress",
  completed: "Completed",
  failed: "Failed",
  dropped: "Dropped",
  withdrawn: "Withdrawn",
};

/** Status options in the order a term goes through them. */
export const STATUS_OPTIONS: readonly { value: PlanStatus; label: string }[] = PLAN_STATUSES.map(
  (value) => ({ value, label: STATUS_LABELS[value] }),
);

export const SOURCE_LABELS: Readonly<Record<PlanItemSource, string>> = {
  catalog: "Catalog",
  manual: "Manual entry",
  transfer: "Transfer credit",
  ap: "AP credit",
  "ai-draft": "From AI suggestions",
};

/** Kept for history; never count toward credits or requirements. */
export const INACTIVE_STATUSES: ReadonlySet<PlanStatus> = new Set([
  "failed",
  "dropped",
  "withdrawn",
]);

export const TAB_LABELS: Readonly<Record<PlanTab, string>> = {
  next: "Next semester",
  "four-year": "4-year plan",
  suggestions: "Suggestions",
  summer: "Summer",
};

/** "1 credit", "2 credits", "0.5 credits", "0 credits". */
export function creditsText(credits: number): string {
  return `${formatNumber(credits)} ${credits === 1 ? "credit" : "credits"}`;
}

/** 1 → "1", 0.5 → "0.5", 1.25 → "1.25" (no trailing zeros). */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** "1 course" / "3 courses". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
