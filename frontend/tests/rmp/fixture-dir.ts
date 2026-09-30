import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";
import { RMP_DAVIDSON_SCHOOL_ID } from "@/lib/types/ratings";
import { resetFixtureCache } from "@/server/http/fixtures";

/**
 * A throwaway fixtures directory for roster edge cases (pagination, upstream failures, bad shapes), still served
 * by EXTERNAL_MODE=fixtures: process.cwd() points at a temp dir holding tests/fixtures/external/ratemyprofessors.
 * Routes are matched in order, so list the most specific `bodyIncludes` (e.g. an `after` cursor) first.
 */

export interface RosterRoute {
  file: string;
  body: unknown;
  status?: number;
  bodyIncludes?: string;
}

export function serveRosterFixtures(routes: readonly RosterRoute[]): { cleanup(): void } {
  const cwd = mkdtempSync(path.join(tmpdir(), "mis-rmp-"));
  const dir = path.join(cwd, "tests", "fixtures", "external", "ratemyprofessors");
  mkdirSync(dir, { recursive: true });
  for (const route of routes) {
    writeFileSync(
      path.join(dir, route.file),
      typeof route.body === "string" ? route.body : JSON.stringify(route.body),
    );
  }
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      source: "ratemyprofessors",
      description: "test",
      routes: routes.map((route) => ({
        method: "POST",
        url: "https://www.ratemyprofessors.com/graphql",
        bodyIncludes: route.bodyIncludes ?? RMP_DAVIDSON_SCHOOL_ID,
        file: route.file,
        ...(route.status ? { status: route.status } : {}),
      })),
    }),
  );
  resetFixtureCache();
  const spy = vi.spyOn(process, "cwd").mockReturnValue(cwd);
  return {
    cleanup() {
      spy.mockRestore();
      resetFixtureCache();
      rmSync(cwd, { recursive: true, force: true });
    },
  };
}

let nextLegacyId = 9_500_000;

export function teacherNode(
  firstName: string,
  lastName: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const legacyId = (overrides.legacyId as number | undefined) ?? nextLegacyId++;
  return {
    __typename: "Teacher",
    id: Buffer.from(`Teacher-${legacyId}`).toString("base64"),
    legacyId,
    firstName,
    lastName,
    department: "Biology",
    avgRating: 4,
    avgDifficulty: 3,
    numRatings: 10,
    wouldTakeAgainPercent: 80,
    school: { __typename: "School", id: RMP_DAVIDSON_SCHOOL_ID, name: "Davidson College" },
    ...overrides,
  };
}

/**
 * One GraphQL page. resultCount defaults to the page's node count (a one-page roster); pass the whole roster's
 * count on the first page of a multi-page roster.
 */
export function rosterPage(
  nodes: readonly unknown[],
  pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  },
  extra: { resultCount?: number | null; didFallback?: boolean; errors?: unknown } = {},
) {
  return {
    data: {
      newSearch: {
        teachers: {
          didFallback: extra.didFallback ?? false,
          resultCount: extra.resultCount === undefined ? nodes.length : extra.resultCount,
          pageInfo,
          edges: nodes.map((node, i) => ({ cursor: `edge-${i}`, node })),
        },
      },
    },
    ...(extra.errors !== undefined ? { errors: extra.errors } : {}),
  };
}
