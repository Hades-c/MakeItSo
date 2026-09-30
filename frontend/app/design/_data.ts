/**
 * Data for the dev-only design gallery (app/design). Classes, instructors, times and rooms are the Davidson public
 * Fall 2026 schedule (term 202601) used by the Lakeside mockups; plan, ratings and anything marked "sample" are
 * illustrative. Never import this outside app/design: sample content must not ship (PLAN §5).
 */
import type { SearchResult } from "@/components/app/search-client";
import type { AddToPlanTerm } from "@/components/domain/add-to-plan-control";
import type { TimelineItem } from "@/components/domain/day-timeline";
import type { FiveDayStripDay } from "@/components/domain/five-day-strip";
import type { PlanMapTerm } from "@/components/domain/plan-map";
import type { RequirementSlot } from "@/components/domain/requirement-slots";
import type { WeekGridBlock } from "@/components/domain/week-grid";
import type { WeekDay } from "@/components/domain/week-days";

/** Wednesday, September 30, 2026, 9:12 AM EDT: the mockups' "now". */
export const NOW = new Date("2026-09-30T13:12:00Z");
export const TIME_ZONE = "America/New_York";

interface Section {
  code: string;
  title: string;
  instructor: string;
  days: WeekDay[];
  start: string;
  end: string;
  room: string;
}

/** Davidson public schedule, Fall 2026 (202601). */
export const FALL_2026: Record<"csc" | "eco" | "eng" | "env" | "his", Section> = {
  csc: {
    code: "CSC 221 A",
    title: "Data Structures",
    instructor: "Terrence Lim",
    days: ["M", "W", "F"],
    start: "10:30",
    end: "11:20",
    room: "Watson 132",
  },
  eco: {
    code: "ECO 232 A",
    title: "Economics of Migration",
    instructor: "Shyam Gouri Suresh",
    days: ["M", "W", "F"],
    start: "11:30",
    end: "12:20",
    room: "Watson 243",
  },
  eng: {
    code: "ENG 260 A",
    title: "British Literature Since 1800",
    instructor: "Molly Young",
    days: ["T", "R"],
    start: "09:40",
    end: "10:55",
    room: "Chambers 3084",
  },
  env: {
    code: "ENV 237 A",
    title: "Intro to Interdisciplinary GIS",
    instructor: "Risper Nyairo",
    days: ["M", "W"],
    start: "14:30",
    end: "15:45",
    room: "Watson 247",
  },
  his: {
    code: "HIS 357 A",
    title: "The Civil Rights Movement",
    instructor: "Dan Aldridge",
    days: ["T", "R"],
    start: "12:15",
    end: "13:30",
    room: "Chambers 1027",
  },
};

function blocksFor(section: Section, extra: Partial<WeekGridBlock> = {}): WeekGridBlock[] {
  return section.days.map((day) => ({
    id: `${section.code}-${day}`,
    code: section.code,
    title: section.title,
    day,
    start: section.start,
    end: section.end,
    room: section.room,
    ...extra,
  }));
}

/** "Your week with HIS 357": the four Fall 2026 classes plus HIS 357 A as a tentative addition. */
export const WEEK_WITH_HIS_357: WeekGridBlock[] = [
  ...blocksFor(FALL_2026.csc),
  ...blocksFor(FALL_2026.eco),
  ...blocksFor(FALL_2026.eng),
  ...blocksFor(FALL_2026.env),
  ...blocksFor(FALL_2026.his, { tentative: true }),
];

/** Edge cases: a conflicting candidate, a TBA ensemble and a Saturday field lab (sample). */
export const WEEK_EDGE_CASES: WeekGridBlock[] = [
  ...blocksFor(FALL_2026.csc),
  ...blocksFor(FALL_2026.eco, { conflict: true }),
  ...blocksFor(FALL_2026.eng),
  ...(["M", "W", "F"] as const).map((day) => ({
    id: `CHE 115 A-${day}`,
    code: "CHE 115 A",
    title: "Principles of Chemistry (sample time)",
    day,
    start: "11:00",
    end: "12:15",
    room: "Wall 240",
    conflict: true,
    tentative: true,
  })),
  { id: "MUS 010 A", code: "MUS 010 A", title: "Chamber Singers", tba: true },
  {
    id: "ENV 220 L-S",
    code: "ENV 220 L",
    title: "Field lab (sample)",
    day: "S",
    start: "09:00",
    end: "12:00",
    room: "Ecological Preserve",
  },
  {
    id: "THE 101 A-R",
    code: "THE 101 A",
    title: "Rehearsal (sample)",
    day: "R",
    start: "19:00",
    end: "21:30",
    room: "Duke Family Performance Hall",
  },
];

function classItem(section: Section): TimelineItem {
  return {
    id: section.code,
    kind: "class",
    code: section.code,
    title: section.title,
    start: section.start,
    end: section.end,
    location: section.room,
    detail: section.instructor,
    source: "course-schedule",
  };
}

/** The mockup Wednesday: CSC 221 A, ECO 232 A, ENV 237 A. */
export const WEDNESDAY: TimelineItem[] = [
  classItem(FALL_2026.csc),
  classItem(FALL_2026.eco),
  classItem(FALL_2026.env),
];

/** Edge cases for Thursday, Oct 1 (sample events): overlaps, a deadline, an early and an evening item. */
export const THURSDAY_EDGE_CASES: TimelineItem[] = [
  {
    id: "study",
    kind: "event",
    title: "Study group (sample)",
    start: "08:30",
    end: "09:30",
    location: "Library",
    source: "my-plan",
  },
  classItem(FALL_2026.eng),
  {
    id: "ps",
    kind: "deadline",
    code: "CSC 221",
    title: "Problem set",
    start: "11:59",
    source: "my-plan",
  },
  {
    id: "talk",
    kind: "event",
    title: "Faculty lunch talk (sample)",
    start: "12:00",
    end: "13:00",
    location: "Hurt Hub",
    source: "hurt-hub",
  },
  {
    id: "dropin",
    kind: "event",
    title: "Advising drop-in (sample)",
    start: "12:30",
    end: "13:30",
    location: "Chambers",
    source: "registrar",
  },
  classItem(FALL_2026.his),
  {
    id: "club",
    kind: "event",
    title: "Club open house (sample)",
    start: "19:00",
    end: "20:30",
    location: "Union",
    source: "wildcatsync",
  },
];
export const THURSDAY_NOW = new Date("2026-10-01T16:40:00Z"); // 12:40 PM EDT

export const WEEK_STRIP: FiveDayStripDay[] = [
  { date: "2026-09-28", label: "Mon", count: 3, isToday: false, href: "/design?day=2026-09-28" },
  { date: "2026-09-29", label: "Tue", count: 1, isToday: false, href: "/design?day=2026-09-29" },
  { date: "2026-09-30", label: "Wed", count: 3, isToday: true, href: "/design?day=2026-09-30" },
  { date: "2026-10-01", label: "Thu", count: 1, isToday: false, href: "/design?day=2026-10-01" },
  { date: "2026-10-02", label: "Fri", count: 2, isToday: false, href: "/design?day=2026-10-02" },
];

const done = (code: string) => ({ status: "done" as const, code, credits: 1 });
const now = (code: string) => ({ status: "in-progress" as const, code, credits: 1 });

/** Class of 2029, CS + economics: Fall 2025 → Spring 2029 (courses from the 2025-26 and 2026-27 schedules). */
export const PLAN_2029: PlanMapTerm[] = [
  {
    termCode: "202501",
    label: "Fall 2025",
    slots: [done("WRI 101"), done("CSC 121"), done("MAT 112"), done("ECO 101")],
  },
  {
    termCode: "202502",
    label: "Spring 2026",
    slots: [done("MAT 113"), done("CHE 115"), done("ART 101"), done("SPA 101")],
  },
  {
    termCode: "202601",
    label: "Fall 2026",
    isCurrent: true,
    slots: [now("CSC 221"), now("ECO 232"), now("ENG 260"), now("ENV 237")],
  },
  { termCode: "202602", label: "Spring 2027", slots: [] },
  {
    termCode: "202701",
    label: "Fall 2027",
    slots: [{ status: "planned", code: "HIS 357", credits: 1 }],
  },
  { termCode: "202702", label: "Spring 2028", slots: [] },
  { termCode: "202801", label: "Fall 2028", slots: [] },
  { termCode: "202802", label: "Spring 2029", slots: [] },
];

/** Humanities student: HUM 103/104 (2 credits each), a 0-credit ensemble and a summer course. */
export const PLAN_HUMANITIES: PlanMapTerm[] = [
  {
    termCode: "202501",
    label: "Fall 2025",
    slots: [
      { status: "done", code: "HUM 103", credits: 2 },
      done("MAT 112"),
      done("SPA 101"),
      { status: "done", code: "MUS 010", credits: 0 },
    ],
  },
  {
    termCode: "202502",
    label: "Spring 2026",
    slots: [
      { status: "done", code: "HUM 104", credits: 2 },
      done("PSY 101"),
      done("SPA 102"),
      { status: "done", code: "MUS 010", credits: 0 },
    ],
  },
  {
    termCode: "202503",
    label: "Summer 2026",
    slots: [{ status: "done", code: "ENV 201", credits: 1 }],
  },
  {
    termCode: "202601",
    label: "Fall 2026",
    isCurrent: true,
    slots: [now("HIS 357"), now("ENG 260"), now("CSC 121"), now("ECO 101"), now("ART 101")],
  },
  {
    termCode: "202602",
    label: "Spring 2027",
    slots: [
      { status: "planned", code: "CSC 250", credits: 1 },
      { status: "planned", code: "ECO 202", credits: 1 },
    ],
  },
  { termCode: "202701", label: "Fall 2027", slots: [] },
  { termCode: "202702", label: "Spring 2028", slots: [] },
  { termCode: "202801", label: "Fall 2028", slots: [] },
  { termCode: "202802", label: "Spring 2029", slots: [] },
];

/** What HIS 357 fills (course mockup). */
export const REQUIREMENTS: RequirementSlot[] = [
  {
    id: "vprq",
    code: "VPRQ",
    label: "Visual and Performing Arts",
    status: "done",
    course: { code: "ART 101", termLabel: "Spring 2026" },
  },
  {
    id: "nsrq",
    code: "NSRQ",
    label: "Natural Science with lab",
    status: "done",
    course: { code: "CHE 115", termLabel: "Spring 2026" },
  },
  {
    id: "ltrq",
    code: "LTRQ",
    label: "Literary Studies, Creative Writing and Rhetoric",
    status: "this-term",
    course: { code: "ENG 260", termLabel: "Fall 2026" },
  },
  {
    id: "mqrq",
    code: "MQRQ",
    label: "Mathematical and Quantitative Thought",
    status: "this-term",
    course: { code: "CSC 221", termLabel: "Fall 2026" },
  },
  {
    id: "ssrq",
    code: "SSRQ",
    label: "Social-Scientific Thought",
    status: "this-term",
    course: { code: "ECO 232", termLabel: "Fall 2026" },
  },
  {
    id: "htrq",
    code: "HTRQ",
    label: "Historical Thought",
    status: "open",
    course: { code: "HIS 357", termLabel: "Fall 2027" },
  },
  {
    id: "jec",
    code: "JEC",
    label: "Justice, Equality and Community",
    status: "open",
    course: { code: "HIS 357", termLabel: "Fall 2027" },
  },
  { id: "prrq", code: "PRRQ", label: "Philosophical and Religious Perspectives", status: "open" },
  { id: "comp", code: "Writing", label: "Writing requirement", status: "done" },
  { id: "lang", code: "Language", label: "Foreign language", status: "open" },
];

export const REQUIREMENTS_PLANNED: RequirementSlot[] = [
  {
    id: "htrq",
    code: "HTRQ",
    label: "Historical Thought",
    status: "planned",
    course: { code: "HIS 357", termLabel: "Fall 2027" },
  },
  { id: "cult", code: "CULT", label: "Cultural Diversity", status: "open" },
  {
    id: "prrq",
    code: "PRRQ",
    label: "Philosophical and Religious Perspectives",
    status: "done",
    course: { code: "REL 101", termLabel: "Fall 2025" },
  },
  {
    id: "lang",
    code: "Language",
    label: "Foreign language",
    status: "this-term",
    course: { code: "SPA 201", termLabel: "Fall 2026" },
  },
];

export const ADD_TO_PLAN_TERMS: AddToPlanTerm[] = [
  {
    code: "202601",
    label: "Fall 2026",
    availability: "offered",
    sectionCount: 1,
    note: "5th course",
  },
  { code: "202602", label: "Spring 2027", availability: "not-offered" },
  { code: "202701", label: "Fall 2027", availability: "not-yet-published" },
];

/** The compact plan preview inside "Add to plan". */
export const PLAN_PREVIEW = PLAN_2029;

/** The sidebar Sources panel in the gallery shell (sample sync times). */
export const SHELL_SOURCES = [
  { id: "course-schedule" as const, lastSync: "2026-09-30T10:00:00Z" },
  { id: "ratemyprofessors" as const, lastSync: "2026-09-29T09:00:00Z" },
  { id: "registrar" as const, label: "Academic calendar", verifiedAt: "2026-09-28T16:00:00Z" },
];

/** Sample command-palette results (not real listings). */
export const SAMPLE_SEARCH_RESULTS: SearchResult[] = [
  {
    kind: "course",
    id: "202601-HIS-357",
    title: "HIS 357 · The Civil Rights Movement",
    subtitle: "Fall 2026 · Dan Aldridge · TTh 12:15–1:30p",
    href: "/courses/202601/HIS-357",
    source: "course-schedule",
  },
  {
    kind: "course",
    id: "202602-HIS-142",
    title: "HIS 142 · The United States since 1900",
    subtitle: "Spring 2027 · MW 8:05–9:20a",
    href: "/courses/202602/HIS-142",
    source: "course-schedule",
  },
  {
    kind: "career",
    id: "law",
    title: "Law and public policy",
    subtitle: "Career path (sample)",
    href: "/careers/law",
  },
  {
    kind: "event",
    id: "evt-1",
    title: "Civil rights film screening (sample)",
    subtitle: "Thu, Oct 1 · 7:00p · Union",
    href: "/events",
    source: "wildcatsync",
  },
];
