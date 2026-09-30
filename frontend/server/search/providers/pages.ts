import "server-only";
import type { SearchResult } from "@/lib/api/search";
import { routes } from "@/lib/routes";
import type { SearchContext } from "@/server/search/types";

/**
 * Search provider: app pages and plan tabs (static, no data). Surfaces behind a flag are left out when the flag is
 * off. Ranking: title prefix, then word prefix, then substring of title or keywords.
 */

interface PageEntry {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  keywords: readonly string[];
  flag?: "careers" | "events" | "alumni" | "ai";
}

const PAGES: readonly PageEntry[] = [
  {
    id: "today",
    title: "Today",
    subtitle: "Your day, deadlines and degree map",
    href: routes.today(),
    keywords: ["home", "dashboard", "schedule", "due soon", "deadlines"],
  },
  {
    id: "courses",
    title: "Courses",
    subtitle: "Search the course schedule",
    href: routes.courses(),
    keywords: ["catalog", "classes", "sections", "search", "schedule"],
  },
  {
    id: "plan",
    title: "My plan",
    subtitle: "Next semester, 4-year plan and summer",
    href: routes.plan(),
    keywords: ["roadmap", "requirements", "credits", "degree"],
  },
  {
    id: "plan-next",
    title: "Next semester",
    subtitle: "WebTree list, week grid and conflicts",
    href: routes.plan("next"),
    keywords: ["webtree", "registration", "crn", "conflicts", "week"],
  },
  {
    id: "plan-four-year",
    title: "4-year plan",
    subtitle: "Terms, credits and the requirements tracker",
    href: routes.plan("four-year"),
    keywords: ["four year", "requirements", "ways of knowing", "degree map"],
  },
  {
    id: "plan-summer",
    title: "Summer",
    subtitle: "Internships, research and summer courses",
    href: routes.plan("summer"),
    keywords: ["internship", "research", "summer"],
  },
  {
    id: "plan-suggestions",
    title: "Suggestions",
    subtitle: "AI course suggestions for your plan",
    href: routes.plan("suggestions"),
    keywords: ["ai", "recommendations", "suggest"],
    flag: "ai",
  },
  {
    id: "careers",
    title: "Careers",
    subtitle: "Career paths, courses and resources",
    href: routes.careers(),
    keywords: ["jobs", "internships", "career paths", "handshake"],
    flag: "careers",
  },
  {
    id: "events",
    title: "Events",
    subtitle: "Campus events from WildcatSync, Hurt Hub and more",
    href: routes.events(),
    keywords: ["calendar", "clubs", "wildcatsync", "library"],
    flag: "events",
  },
  {
    id: "alumni",
    title: "Alumni",
    subtitle: "Verified Davidson alumni",
    href: routes.alumni(),
    keywords: ["network", "linkedin", "mentors"],
    flag: "alumni",
  },
  {
    id: "profile",
    title: "Profile",
    subtitle: "Major, graduation year, AI settings and your data",
    href: routes.profile(),
    keywords: ["settings", "account", "password", "major", "export", "delete"],
  },
];

function score(entry: PageEntry, q: string): number {
  const title = entry.title.toLowerCase();
  if (title.startsWith(q)) return 3;
  if (title.split(/\s+/).some((word) => word.startsWith(q))) return 2;
  if (title.includes(q) || entry.keywords.some((k) => k.includes(q))) return 1;
  return 0;
}

export async function search(
  q: string,
  limit: number,
  ctx: SearchContext,
): Promise<SearchResult[]> {
  const needle = q.toLowerCase();
  return PAGES.filter((entry) => !entry.flag || ctx.flags[entry.flag])
    .map((entry, index) => ({ entry, index, score: score(entry, needle) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => ({
      kind: "page" as const,
      id: entry.id,
      title: entry.title,
      subtitle: entry.subtitle,
      href: entry.href,
    }));
}
