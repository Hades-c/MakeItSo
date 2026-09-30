// Grounds AI output in the live Davidson schedule: prompts get today's date
// and the resolved terms, and any recommended course code that is not on the
// active or registration term schedule is dropped before caching or returning.

import {
  courseNameFor,
  getLiveCatalog,
  normalizeCourseCode,
  type LiveCatalogEntry,
} from "@/lib/davidson-api";
import type { ResolvedTerms, TermInfo } from "@/lib/terms";

export interface AiTermContext {
  today: string; // YYYY-MM-DD
  active: TermInfo;
  registration: TermInfo;
}

export interface AiGrounding {
  context: AiTermContext;
  index: Map<string, LiveCatalogEntry>;
  terms: ResolvedTerms;
}

export async function getAiGrounding(now: Date = new Date()): Promise<AiGrounding> {
  const { terms, index } = await getLiveCatalog();
  return {
    context: { today: now.toISOString().slice(0, 10), active: terms.active, registration: terms.registration },
    index,
    terms,
  };
}

/** Cache-key fragment so cached AI output is not reused across terms. */
export function termKey(ctx: AiTermContext): string {
  return `${ctx.active.code}/${ctx.registration.code}`;
}

// Generic slot placeholders the roadmap prompt asks for at low specificity
// (e.g. "ELEC ---", "DIST ---"). They are not course codes.
const PLACEHOLDER_CODE = /^[A-Z]{2,5}\s*-{2,}$/;

export function isPlaceholderCode(code: unknown): boolean {
  return typeof code === "string" && PLACEHOLDER_CODE.test(code.trim().toUpperCase());
}

/**
 * Keep only items whose `code` is on the live schedule, replacing the name
 * (and department/credits when present) with the official values.
 */
export function keepLiveCourses<T extends { code?: unknown; name?: unknown }>(
  items: unknown,
  index: Map<string, LiveCatalogEntry>,
  opts: { allowPlaceholders?: boolean } = {}
): (T & { code: string; offeredIn?: string[]; placeholder?: boolean })[] {
  if (!Array.isArray(items)) return [];
  const out: (T & { code: string; offeredIn?: string[]; placeholder?: boolean })[] = [];
  for (const item of items as T[]) {
    if (!item || typeof item !== "object" || typeof item.code !== "string") continue;
    if (opts.allowPlaceholders && isPlaceholderCode(item.code)) {
      out.push({ ...item, code: item.code.trim().toUpperCase(), placeholder: true });
      continue;
    }
    const entry = index.get(normalizeCourseCode(item.code));
    if (!entry) continue;
    const grounded: Record<string, unknown> = {
      ...item,
      code: entry.code,
      // Topics courses keep the model's name only if it is a live section title.
      name: courseNameFor(entry, item.name),
      offeredIn: entry.terms.map((t) => t.label),
    };
    if ("department" in item) grounded.department = entry.department;
    if ("credits" in item) grounded.credits = entry.credits;
    out.push(grounded as T & { code: string; offeredIn?: string[] });
  }
  return out;
}

export function groundRecommendations(data: unknown, index: Map<string, LiveCatalogEntry>) {
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return { ...obj, recommendations: keepLiveCourses(obj.recommendations, index) };
}

export function groundCareerPlan(data: unknown, index: Map<string, LiveCatalogEntry>) {
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  return {
    ...obj,
    coursesToTake: keepLiveCourses(obj.coursesToTake, index),
    peopleToMeet: Array.isArray(obj.peopleToMeet) ? obj.peopleToMeet : [],
    thingsToDo: Array.isArray(obj.thingsToDo) ? obj.thingsToDo : [],
  };
}

export function groundRoadmap(data: unknown, index: Map<string, LiveCatalogEntry>) {
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const semesters = Array.isArray(obj.roadmap) ? obj.roadmap : [];
  return {
    ...obj,
    roadmap: semesters
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) =>
        s.isSummer
          ? { ...s, activities: Array.isArray(s.activities) ? s.activities : [] }
          : { ...s, courses: keepLiveCourses(s.courses, index, { allowPlaceholders: true }) }
      ),
  };
}
