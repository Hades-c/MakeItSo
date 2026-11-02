"use client";

import * as React from "react";

/**
 * Where the official description goes when the AI summary leads the course page (course-view.tsx). The server
 * can only tell that the summary may load (gate "ready"); whether it does is known once the panel's request
 * settles. Until then, and when it shows the summary, the description is the page's last card ("bottom"). When
 * the panel ends in anything else (quota, a budget pause, an outage, a consent or verify change since the page
 * rendered, AI switched off), the description comes back to the top, above the panel's notice, so no one meets a
 * notice where the description should be. Exactly one slot renders at a time, so #official-description is unique.
 */

export type AboutOutcome = "pending" | "ok" | "failed";

const OutcomeContext = React.createContext<{
  outcome: AboutOutcome;
  setOutcome: (next: AboutOutcome) => void;
} | null>(null);

export function AboutOutcomeProvider({ children }: { children: React.ReactNode }) {
  const [outcome, setOutcome] = React.useState<AboutOutcome>("pending");
  const value = React.useMemo(() => ({ outcome, setOutcome }), [outcome]);
  return <OutcomeContext.Provider value={value}>{children}</OutcomeContext.Provider>;
}

/** The panel reports how its request settled; a no-op outside a provider (the gated order, unit tests). */
export function useReportAboutOutcome(outcome: AboutOutcome | null) {
  const setOutcome = React.useContext(OutcomeContext)?.setOutcome;
  React.useEffect(() => {
    // "Loading" (a Retry in flight) keeps the last settled layout, so the page does not jump while it waits.
    if (setOutcome && outcome && outcome !== "pending") setOutcome(outcome);
  }, [setOutcome, outcome]);
}

/** Renders its children (the official description card) only in the slot the outcome calls for. */
export function DescriptionSlot({
  at,
  children,
}: {
  at: "top" | "bottom";
  children: React.ReactNode;
}) {
  const outcome = React.useContext(OutcomeContext)?.outcome ?? "pending";
  const top = outcome === "failed";
  return (at === "top") === top ? <>{children}</> : null;
}
