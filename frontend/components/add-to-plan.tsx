"use client";

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { useTerms } from "@/lib/use-terms";
import { parseTermLabel, planTermOptions } from "@/lib/terms";

export interface PlanCourseSummary {
  courseCode: string;
  courseName: string;
  status: string;
  semester: string;
  year: number;
  credits?: number;
}

interface AddToPlanProps {
  courseCode: string;
  courseName: string;
  /** Credits from the Davidson API for this course (the server re-checks). */
  credits?: number;
  inPlan: boolean;
  /** Preselect this term (e.g. a roadmap semester); otherwise the registration term. */
  defaultTermLabel?: string;
  onAdded: (plannedCourses: PlanCourseSummary[]) => void;
}

/**
 * Term picker + "Add to Plan" button. Defaults to the registration term
 * (e.g. Spring 2027), never to "Fall <calendar year>".
 */
export function AddToPlan({ courseCode, courseName, credits, inPlan, defaultTermLabel, onAdded }: AddToPlanProps) {
  const terms = useTerms();
  const [chosen, setChosen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (inPlan) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 px-2 py-1 rounded">
        <Check className="h-3 w-3" /> In Plan
      </span>
    );
  }

  const options = terms ? planTermOptions(terms) : [];
  // A suggested term (e.g. from an AI roadmap) is only preselected if it is
  // the registration term or later; otherwise default to the registration term.
  const preferred =
    terms && defaultTermLabel && options.some((o) => o.label === defaultTermLabel && o.code >= terms.registration.code)
      ? defaultTermLabel
      : terms?.registration.label ?? "";
  const selected = chosen ?? preferred;

  async function add() {
    const parsed = parseTermLabel(selected);
    if (!parsed) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseCode,
          courseName,
          credits,
          semester: parsed.season,
          year: parsed.year,
          status: "planned",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not add this course");
        return;
      }
      onAdded(data.plan?.plannedCourses ?? []);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="inline-flex items-center gap-1.5">
        <select
          aria-label={`Term to add ${courseCode} to`}
          data-testid="add-to-plan-term"
          value={selected}
          disabled={!terms || adding}
          onChange={(e) => setChosen(e.target.value)}
          className="h-7 rounded border border-gray-200 bg-white px-1.5 text-[11px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-davidson/20"
        >
          {!terms && <option value="">Loading terms…</option>}
          {options.map((t) => (
            <option key={t.code} value={t.label}>
              {t.label}
              {terms && t.code === terms.registration.code ? " (registration)" : ""}
              {terms && t.code === terms.active.code ? " (current)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!terms || adding || !selected}
          onClick={add}
          className="inline-flex items-center gap-1 h-7 text-[11px] font-medium text-davidson bg-davidson-light hover:bg-davidson hover:text-white px-2 rounded transition-colors disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add to Plan
        </button>
      </div>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
