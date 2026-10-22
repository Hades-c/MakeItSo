/**
 * Course colour rule (Lakeside): a course's colour is decided by its department alone, so CSC 221 has the same
 * colour on the timeline, the plan map, the week grid and the catalog. The code is always printed next to the
 * colour, so colour is never the only cue (colour-blind safe).
 *
 * The palette has eight text-on-wash pairs, defined as CSS variables in app/globals.css (light and dark, each
 * ≥ 4.5:1). Davidson's current subject codes (every subject in the 2025-26 and 2026-27 schedules) are assigned
 * explicitly: six or seven per colour, with departments that are often taken together (CSC/MAT/PHY/CHE/BIO,
 * ENG/HIS/PHI) on different colours, and the five mockup examples (CSC, ECO, ENV, ENG, HIS) on their mockup
 * colours. Any other code gets a stable colour from a hash, so a new subject needs no configuration.
 *
 * Pure and isomorphic: safe in server components, client components and tests.
 */

export const COURSE_COLORS = [
  "lake",
  "pine",
  "ochre",
  "plum",
  "teal",
  "clay",
  "olive",
  "iris",
] as const;

export type CourseColor = (typeof COURSE_COLORS)[number];

const ASSIGNED: Readonly<Record<CourseColor, readonly string[]>> = {
  lake: ["CSC", "POL", "FRE", "ART", "CIS", "LAT"],
  pine: ["ECO", "BIO", "MUS", "CHI", "GER", "SOU"],
  ochre: ["ENV", "PSY", "REL", "DAN", "GRE", "MIL"],
  plum: ["ENG", "SOC", "SPA", "DIG", "PBH", "WRI"],
  teal: ["HIS", "MAT", "THE", "ANT", "ARB", "LNG"],
  clay: ["CHE", "COM", "AFR", "EDU", "HUM", "RUS"],
  olive: ["PHY", "GSS", "LIT", "EAS", "FMS", "SIL"],
  iris: ["PHI", "DAT", "CLA", "LAS", "FMD", "PPE", "XPL"],
};

/** Explicit department → colour table (Davidson subject codes). */
export const DEPARTMENT_COLORS: Readonly<Record<string, CourseColor>> = Object.freeze(
  Object.fromEntries(
    COURSE_COLORS.flatMap((color) => ASSIGNED[color].map((dept) => [dept, color] as const)),
  ),
);

/** Uppercase letters only: " csc " → "CSC". */
export function normalizeDepartment(department: string): string {
  return department.toUpperCase().replace(/[^A-Z]/g, "");
}

/**
 * The department (subject) part of a course code: "CSC 221" → "CSC", "csc221a" → "CSC", "HIS 357 A" → "HIS".
 * Returns "" when the input has no leading letters.
 */
export function departmentOf(courseCode: string): string {
  const match = /^\s*([A-Za-z]+)/.exec(courseCode);
  return match?.[1] ? match[1].toUpperCase() : "";
}

/** 32-bit FNV-1a with a murmur3 finaliser (short codes need the extra mixing). Identical on every JS engine. */
export function hashCode(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Colour for a department code such as "CSC". Unknown or empty input still gets a stable colour. */
export function departmentColor(department: string): CourseColor {
  const dept = normalizeDepartment(department);
  const assigned = DEPARTMENT_COLORS[dept];
  if (assigned) return assigned;
  // COURSE_COLORS is non-empty, so the index is always in range.
  return COURSE_COLORS[hashCode(dept) % COURSE_COLORS.length] as CourseColor;
}

/** Colour for a course code such as "CSC 221" or "HIS 357 A". */
export function courseColor(courseCode: string): CourseColor {
  return departmentColor(departmentOf(courseCode));
}

/**
 * Static class names per colour (Tailwind only sees complete class strings, so never build these dynamically).
 *   text   coloured text on any surface (course codes in lists)
 *   chip   coloured text on its wash (code chips, plan cells, timeline blocks)
 *   fill   solid colour with surface-coloured text (index-card tab)
 *   border coloured border (timeline accent, "now" outline, dashed planned slot)
 */
export const COURSE_COLOR_CLASSES: Readonly<
  Record<CourseColor, { text: string; chip: string; fill: string; border: string }>
> = {
  lake: {
    text: "text-course-lake",
    chip: "bg-course-lake-wash text-course-lake",
    fill: "bg-course-lake text-surface",
    border: "border-course-lake",
  },
  pine: {
    text: "text-course-pine",
    chip: "bg-course-pine-wash text-course-pine",
    fill: "bg-course-pine text-surface",
    border: "border-course-pine",
  },
  ochre: {
    text: "text-course-ochre",
    chip: "bg-course-ochre-wash text-course-ochre",
    fill: "bg-course-ochre text-surface",
    border: "border-course-ochre",
  },
  plum: {
    text: "text-course-plum",
    chip: "bg-course-plum-wash text-course-plum",
    fill: "bg-course-plum text-surface",
    border: "border-course-plum",
  },
  teal: {
    text: "text-course-teal",
    chip: "bg-course-teal-wash text-course-teal",
    fill: "bg-course-teal text-surface",
    border: "border-course-teal",
  },
  clay: {
    text: "text-course-clay",
    chip: "bg-course-clay-wash text-course-clay",
    fill: "bg-course-clay text-surface",
    border: "border-course-clay",
  },
  olive: {
    text: "text-course-olive",
    chip: "bg-course-olive-wash text-course-olive",
    fill: "bg-course-olive text-surface",
    border: "border-course-olive",
  },
  iris: {
    text: "text-course-iris",
    chip: "bg-course-iris-wash text-course-iris",
    fill: "bg-course-iris text-surface",
    border: "border-course-iris",
  },
};
