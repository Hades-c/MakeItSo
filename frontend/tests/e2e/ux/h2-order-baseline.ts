import type { KnownH2Sequences } from "./metrics";

/**
 * The h2 order mismatches the pages have today (WCAG 1.3.2: the DOM reads the sections in another order than the
 * screen shows them), keyed "<page>@<width>", each with both sequences exactly as ux.spec measures them (h2 text,
 * first 24 characters) and the item that fixes it. The h2 check is hard from day one (spec QW0): a mismatch not
 * listed here fails, a listed one whose sequences change fails, and a listed one that is now in order fails until
 * its entry is removed. Remove entries as their item lands; never add one to turn CI green (a new mismatch is a
 * bug to fix, or a decision for the spec owner). `alsoVisual` is only for two headings that sit on one row
 * within a few pixels, where the screen order can measure either way.
 */
export interface KnownH2Order extends KnownH2Sequences {
  /** What fixes it (a spec item), or why it is accepted for now. */
  until: string;
}

export const H2_ORDER_BASELINE: Readonly<Record<string, KnownH2Order>> = {
  "today@1440": {
    dom: [
      "Today 9a–8p",
      "Degree progress",
      "Due for you 4",
      "This week on campus",
      "Opportunities",
      "Quick links",
    ],
    visual: [
      "Today 9a–8p",
      "Due for you 4",
      "This week on campus",
      "Degree progress",
      "Opportunities",
      "Quick links",
    ],
    until: "QW8 (Today's JSX in phone order, placed with grid areas)",
  },
  "today@1024": {
    dom: [
      "Today 9a–8p",
      "Degree progress",
      "Due for you 4",
      "This week on campus",
      "Opportunities",
      "Quick links",
    ],
    visual: [
      "Today 9a–8p",
      "Due for you 4",
      "Degree progress",
      "This week on campus",
      "Opportunities",
      "Quick links",
    ],
    // The two columns end within a pixel of each other here (Degree progress at 1458, This week on campus at
    // 1459, one row): Due for you a line shorter puts This week on campus first.
    alsoVisual: [
      "Today 9a–8p",
      "Due for you 4",
      "This week on campus",
      "Degree progress",
      "Opportunities",
      "Quick links",
    ],
    until: "QW8 (Today's JSX in phone order, placed with grid areas)",
  },
  "today@768": {
    dom: [
      "Today 9a–8p",
      "Degree progress",
      "Due for you 4",
      "This week on campus",
      "Opportunities",
      "Quick links",
    ],
    visual: [
      "Today 9a–8p",
      "Due for you 4",
      "This week on campus",
      "Degree progress",
      "Opportunities",
      "Quick links",
    ],
    until: "QW8 (Today's JSX in phone order, placed with grid areas)",
  },
  "today@390": {
    dom: [
      "Today 9a–8p",
      "Degree progress",
      "Due for you 4",
      "This week on campus",
      "Opportunities",
      "Quick links",
    ],
    visual: [
      "Today 9a–8p",
      "Due for you 4",
      "This week on campus",
      "Degree progress",
      "Opportunities",
      "Quick links",
    ],
    until: "QW8 (Today's JSX in phone order, placed with grid areas)",
  },
  "course-csc221@1440": {
    dom: [
      "About",
      "Add to plan",
      "Sections 2",
      "About this course",
      "Other terms",
      "Your week with CSC 221",
    ],
    visual: [
      "About",
      "Add to plan",
      "Sections 2",
      "Your week with CSC 221",
      "About this course",
      "Other terms",
    ],
    until: "QW8 (the course page puts About before Sections)",
  },
  "course-csc221@1024": {
    dom: [
      "About",
      "Add to plan",
      "Sections 2",
      "About this course",
      "Other terms",
      "Your week with CSC 221",
    ],
    visual: [
      "About",
      "Add to plan",
      "Sections 2",
      "Your week with CSC 221",
      "About this course",
      "Other terms",
    ],
    until: "QW8 (the course page puts About before Sections)",
  },
  "plan-next@1440": {
    dom: ["Spring 2027 registration", "Spring 2027 WebTree list", "No Spring 2027 choices y"],
    visual: ["Spring 2027 WebTree list", "Spring 2027 registration", "No Spring 2027 choices y"],
    until: "M8 (the registration rows become one status line)",
  },
  "events@1440": {
    dom: [
      "Library hours today",
      "Ongoing Started before t",
      "Today Wednesday, Septemb",
      "Tomorrow Thursday, Octob",
      "Friday, October 2, 1 ite",
      "Monday, October 5, 1 ite",
      "Tuesday, October 6, 4 it",
      "Thursday, October 8, 3 i",
      "Saturday, October 10, 1 ",
      "Monday, October 12, 2 it",
      "Tuesday, October 13, 1 i",
      "Calendars",
    ],
    visual: [
      "Library hours today",
      "Calendars",
      "Ongoing Started before t",
      "Today Wednesday, Septemb",
      "Tomorrow Thursday, Octob",
      "Friday, October 2, 1 ite",
      "Monday, October 5, 1 ite",
      "Tuesday, October 6, 4 it",
      "Thursday, October 8, 3 i",
      "Saturday, October 10, 1 ",
      "Monday, October 12, 2 it",
      "Tuesday, October 13, 1 i",
    ],
    until: "M9 (the Calendars card becomes a line and a filter)",
  },
};
