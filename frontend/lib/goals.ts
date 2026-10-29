/**
 * Goals: what a student hopes to get out of Davidson (PLAN-UX §8), the optional second half of the onboarding
 * Interests step and of the Profile Interests section. A small, fixed taxonomy, same shape as the career-path
 * interests (server/content/careers.ts) but with no curated content behind it, so it lives here rather than under
 * server/content. Isomorphic: both pickers render these slugs directly, and server/auth/profile.ts validates
 * stored values against isGoalSlug the same way it checks interests against isCareerSlug.
 */

export interface GoalOption {
  slug: string;
  label: string;
}

export const GOALS: readonly GoalOption[] = [
  { slug: "grad-school", label: "Go to graduate or professional school" },
  { slug: "research", label: "Do research with a professor" },
  { slug: "internship", label: "Land an internship" },
  { slug: "study-abroad", label: "Study abroad" },
  { slug: "job-after-graduation", label: "Get a job right after graduating" },
  { slug: "explore-fields", label: "Explore different fields before deciding" },
  { slug: "build-network", label: "Build a professional network" },
  { slug: "improve-skills", label: "Strengthen specific skills, like writing, coding or data" },
];

export const MAX_GOALS = GOALS.length;

const GOAL_SLUGS = new Set(GOALS.map((goal) => goal.slug));

/** Whether `value` is one of the fixed goal slugs above (an old or hand-edited value is not). */
export function isGoalSlug(value: string): boolean {
  return GOAL_SLUGS.has(value);
}
