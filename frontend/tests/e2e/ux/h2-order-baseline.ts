/**
 * Where the h2 order check (WCAG 1.3.2: the DOM reads the sections in the order the screen shows them) is only a
 * warning: the page@width pairs whose h2s are out of order today, each with the item that fixes it. Everywhere else
 * ux.spec measures, the order passes today, and there a mismatch fails. The headings' text (counts such as "Due for
 * you 4", event days) is not part of the rule, so a warned page stays a warning whatever its h2s say, and a page
 * that passes stays hard. When an item lands and its page reads in order, the check says so ("in order now")
 * until the entry is removed here, which makes that page hard. Never add an entry to turn CI green: a new mismatch
 * on a hard page is a bug to fix, or a decision for the spec owner.
 */
export interface H2OrderWarning {
  /** What fixes it (a spec item), or why it is accepted for now. */
  until: string;
}

export const H2_ORDER_WARN_ONLY: Readonly<Record<string, H2OrderWarning>> = {
  "course-csc221@1440": { until: "QW8 (the course page puts About before Sections)" },
  "course-csc221@1024": { until: "QW8 (the course page puts About before Sections)" },
  "plan-next@1440": { until: "M8 (the registration rows become one status line)" },
  "events@1440": { until: "M9 (the Calendars card becomes a line and a filter)" },
};
